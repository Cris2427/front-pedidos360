// src/lib/errors.ts
// Traduce un error de fetch/ApiError a un mensaje legible para el usuario.
//
// Regla: si el backend explicó el problema, ese mensaje manda. Las pistas de
// más abajo son solo para los códigos que el API Gateway responde por su
// cuenta, sin que la Lambda llegue a ejecutarse.
import { ApiError } from '../api/client';

/** Pistas para errores que NO traen explicación del backend. */
const PISTAS: Record<number, string> = {
  401: 'Sesión o token inválido para la API: lo rechazó el JWT authorizer (firma, issuer, audience o expiración).',
  403: 'Te falta el scope o el App Role que exige la Lambda.',
  404: 'Esa ruta no existe en el API Gateway (¿falta crearla o desplegar la Lambda?).',
  500: 'Error interno del backend. Revisa los logs de la Lambda en CloudWatch.',
  502: 'El API Gateway no pudo invocar la Lambda (revisa la integración y los permisos).',
};

/** Extrae el mensaje que el backend haya puesto en el cuerpo, si lo hay. */
function mensajeDelBackend(body: unknown): string | null {
  if (typeof body === 'string') return body.trim() || null;
  if (!body || typeof body !== 'object') return null;

  const obj = body as Record<string, unknown>;
  // Nuestra Lambda responde { error, hint }; el API Gateway usa { message }.
  const error = typeof obj.error === 'string' ? obj.error : null;
  const hint = typeof obj.hint === 'string' ? obj.hint : null;
  if (error) return hint ? `${error} ${hint}` : error;

  // "Unauthorized" / "Not Found" a secas los pone el API Gateway: no aportan
  // nada que el código de estado no diga ya, así que preferimos la pista.
  const message = typeof obj.message === 'string' ? obj.message : null;
  if (message && !['unauthorized', 'not found', 'forbidden'].includes(message.toLowerCase())) {
    return message;
  }
  return null;
}

export function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    const delBackend = mensajeDelBackend(err.body);
    const detalle = delBackend ?? PISTAS[err.status] ?? '';
    return detalle ? `API ${err.status} — ${detalle}` : `API ${err.status} ${err.statusText}`;
  }

  if (err instanceof TypeError) {
    // fetch lanza TypeError cuando el navegador bloquea la petición: casi
    // siempre es CORS (falta el método en la configuración del API Gateway).
    return `No se pudo contactar la API: ${err.message}. Si el método es POST/PUT/PATCH, revisa el CORS del API Gateway.`;
  }

  return err instanceof Error ? err.message : 'Error desconocido';
}
