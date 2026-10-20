// La clave administrativa solo se usa dentro de la función, nunca en el navegador.
export function createOperatorHandler({ createClient, url, serviceKey, allowedOrigins }) {
  return async request => {
    const origin = request.headers.get('origin');
    const headers = {
      'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin',
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };
    if (origin && allowedOrigins.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
    const reply = (status, message) => new Response(JSON.stringify({ message }), { status, headers });
    if (origin && !allowedOrigins.includes(origin)) return reply(403, 'Origen no permitido.');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return reply(405, 'Método no permitido.');
    if (!url || !serviceKey) return reply(503, 'El registro de operadores no está disponible.');
    try {
      const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
      if (!token) return reply(401, 'Inicia sesión para continuar.');
      const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
      // Verificar el token con Auth y el permiso en la base de datos en cada solicitud.
      const { data: auth, error: authError } = await admin.auth.getUser(token);
      if (authError || !auth?.user) return reply(401, 'Tu sesión terminó. Vuelve a iniciar sesión.');
      const { data: principal, error: roleError } = await admin.from('user_administration').select('user_id').eq('id', 1).eq('user_id', auth.user.id).maybeSingle();
      if (roleError) return reply(503, 'La administración de usuarios no está disponible.');
      if (!principal) return reply(403, 'Solo la cuenta principal puede registrar usuarios.');
      const { data: activePrincipal, error: activeError } = await admin.from('operators').select('user_id').eq('user_id', auth.user.id).eq('is_active', true).maybeSingle();
      if (activeError) return reply(503, 'La administración de usuarios necesita actualizarse.');
      if (!activePrincipal) return reply(403, 'Tu cuenta no tiene acceso.');
      if (Number(request.headers.get('content-length')) > 8192) return reply(413, 'Solicitud demasiado grande.');
      let body;
      try {
        const raw = await request.text();
        if (raw.length > 8192) return reply(413, 'Solicitud demasiado grande.');
        body = JSON.parse(raw);
      } catch { return reply(400, 'Datos no válidos.'); }
      const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
      const password = body?.password;
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply(400, 'Escribe un correo válido.');
      if (typeof password !== 'string' || password.length < 10 || password.length > 128) return reply(400, 'La contraseña debe tener entre 10 y 128 caracteres.');
      // No se aceptan roles ni identificadores del cliente: toda cuenta creada es operadora.
      const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (createError || !created?.user) {
        if (['email_exists', 'user_already_exists'].includes(createError?.code)) return reply(409, 'Ya existe una cuenta con ese correo.');
        if (createError?.code === 'weak_password') return reply(400, 'Elige una contraseña más segura.');
        return reply(502, 'No se pudo crear la cuenta. Comprueba si el correo ya está registrado antes de volver a intentarlo.');
      }
      const { error: membershipError } = await admin.from('operators').insert({ user_id: created.user.id });
      if (membershipError) {
        const { error: rollbackError } = await admin.auth.admin.deleteUser(created.user.id);
        return reply(502, rollbackError ? 'No se pudo autorizar la cuenta. Contacta a la organización antes de volver a intentarlo.' : 'No se pudo autorizar la cuenta. Puedes volver a intentarlo.');
      }
      return reply(201, 'Usuario creado. Ya puede iniciar sesión como operador.');
    } catch {
      return reply(500, 'No se pudo completar el registro. Comprueba si la cuenta fue creada antes de volver a intentarlo.');
    }
  };
}
