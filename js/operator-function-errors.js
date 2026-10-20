// Traduce errores del gateway sin mostrar mensajes internos de infraestructura.
export async function operatorFunctionError(error, fallback, functionUrl, fetcher = fetch) {
  let body;
  try { body = await error.context?.json(); } catch { /* Red o respuesta sin JSON. */ }
  // Un preflight 404 impide leer la respuesta del POST en el navegador.
  // Consultar solo la disponibilidad con GET, sin token ni datos del formulario.
  if (!body && !error.context && functionUrl) {
    try {
      const response = await fetcher(functionUrl, { method: 'GET', credentials: 'omit', signal: AbortSignal.timeout(5000) });
      if (response.status === 404) {
        const probe = await response.json();
        if (probe?.code === 'NOT_FOUND') body = probe;
      }
    } catch { /* Mantener el mensaje de conexión cuando no se puede comprobar. */ }
  }
  if (body?.code === 'NOT_FOUND' || (error.context?.status === 404 && body?.message === 'Requested function was not found')) {
    return 'La gestión de usuarios todavía no está habilitada. Contacta a la organización.';
  }
  if (error.context?.status === 401) return 'No se pudo validar tu sesión. Cierra sesión y vuelve a entrar.';
  if (['BOOT_ERROR', 'WORKER_ERROR', 'WORKER_LIMIT'].includes(body?.code)) return 'La gestión de usuarios no está disponible en este momento. Contacta a la organización.';
  if (typeof body?.message === 'string' && !body.code) return body.message;
  return fallback;
}
