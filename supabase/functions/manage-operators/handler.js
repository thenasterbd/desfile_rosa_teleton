export function manageOperatorsHandler({ createClient, url, serviceKey, allowedOrigins }) {
  return async request => {
    const origin = request.headers.get('origin');
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin',
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
    if (origin && allowedOrigins.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
    const reply = (status, body) => new Response(JSON.stringify(typeof body === 'string' ? { message: body } : body), { status, headers });
    if (origin && !allowedOrigins.includes(origin)) return reply(403, 'Origen no permitido.');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return reply(405, 'Método no permitido.');
    if (!url || !serviceKey) return reply(503, 'La administración de usuarios no está disponible.');
    try {
      const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
      if (!token) return reply(401, 'Inicia sesión para continuar.');
      const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data: auth, error: authError } = await admin.auth.getUser(token);
      if (authError || !auth?.user) return reply(401, 'Tu sesión terminó. Vuelve a iniciar sesión.');
      const { data: owner, error: ownerError } = await admin.from('user_administration').select('user_id').eq('id', 1).eq('user_id', auth.user.id).maybeSingle();
      if (ownerError) return reply(503, 'La administración de usuarios no está disponible.');
      if (!owner) return reply(403, 'Solo la cuenta principal puede administrar usuarios.');
      const { data: activeOwner, error: activeError } = await admin.from('operators').select('user_id').eq('user_id', auth.user.id).eq('is_active', true).maybeSingle();
      if (activeError) return reply(503, 'La administración de usuarios necesita actualizarse.');
      if (!activeOwner) return reply(403, 'Tu cuenta no tiene acceso.');
      if (Number(request.headers.get('content-length')) > 8192) return reply(413, 'Solicitud demasiado grande.');
      let body;
      try { const raw = await request.text(); if (raw.length > 8192) return reply(413, 'Solicitud demasiado grande.'); body = JSON.parse(raw); }
      catch { return reply(400, 'Datos no válidos.'); }
      const action = body?.action;
      if (action === 'list') {
        const page = body.page ?? 1;
        if (!Number.isInteger(page) || page < 1 || page > 1000000) return reply(400, 'Página no válida.');
        const offset = (page - 1) * 20;
        const { data: rows, error } = await admin.from('operators').select('user_id,is_active').order('user_id').range(offset, offset + 20);
        if (error) return reply(503, 'No se pudo cargar la lista de operadores.');
        const users = await Promise.all((rows || []).slice(0, 20).map(async row => {
          const { data, error } = await admin.auth.admin.getUserById(row.user_id);
          if (error || !data?.user) throw new Error('User lookup failed');
          return { id: row.user_id, email: data.user.email || 'Sin correo', active: row.is_active, isPrincipal: row.user_id === owner.user_id };
        }));
        return reply(200, { users, page, hasMore: (rows || []).length > 20 });
      }
      if (!['disable', 'enable', 'password'].includes(action)) return reply(400, 'Acción no válida.');
      if (typeof body.userId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.userId)) return reply(400, 'Usuario no válido.');
      // Proteger la cuenta principal también frente a solicitudes manuales.
      if (body.userId === owner.user_id) return reply(403, 'Estas acciones no se aplican a la cuenta principal.');
      const { data: target, error: targetError } = await admin.from('operators').select('user_id,is_active').eq('user_id', body.userId).maybeSingle();
      if (targetError) return reply(503, 'No se pudo comprobar el usuario.');
      if (!target) return reply(404, 'El operador ya no está disponible.');
      if (action === 'password') {
        if (typeof body.password !== 'string' || body.password.length < 10 || body.password.length > 128) return reply(400, 'La contraseña debe tener entre 10 y 128 caracteres.');
        const { error } = await admin.auth.admin.updateUserById(body.userId, { password: body.password });
        if (error) return reply(502, error.code === 'weak_password' ? 'Elige una contraseña más segura.' : 'No se pudo cambiar la contraseña.');
        return reply(200, 'Contraseña actualizada. Comparte la nueva clave de forma privada.');
      }
      if (action === 'disable') {
        // Revocar primero los permisos: los JWT existentes tampoco podrán escribir.
        const { error } = await admin.from('operators').update({ is_active: false }).eq('user_id', body.userId);
        if (error) return reply(502, 'No se pudo deshabilitar al operador.');
        const { error: banError } = await admin.auth.admin.updateUserById(body.userId, { ban_duration: '876000h' });
        return reply(200, banError ? 'Operador deshabilitado para administrar el evento. No se pudo bloquear el inicio de sesión; puedes repetir la acción.' : 'Operador deshabilitado. Ya no puede administrar el evento.');
      }
      // Al habilitar, retirar primero el bloqueo de Auth; mantener permisos revocados si falla.
      const { error: unbanError } = await admin.auth.admin.updateUserById(body.userId, { ban_duration: 'none' });
      if (unbanError) return reply(502, 'No se pudo habilitar al operador.');
      const { error: enableError } = await admin.from('operators').update({ is_active: true }).eq('user_id', body.userId);
      if (enableError) return reply(502, 'El operador sigue sin acceso. Vuelve a intentar habilitarlo.');
      return reply(200, 'Operador habilitado. Ya puede iniciar sesión.');
    } catch { return reply(500, 'No se pudo completar la operación. Revisa el estado del usuario antes de volver a intentarlo.'); }
  };
}
