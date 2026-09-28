// si el backend explico el problema gana ese mensaje, si no va una pista
import { ApiError } from '../api/client';

const PISTAS: Record<number, string> = {
  401: 'Sesión o token inválido para la API: lo rechazó el JWT authorizer (firma, issuer, audience o expiración).',
  403: 'Te falta el scope o el App Role que exige la Lambda.',
  404: 'Esa ruta no existe en el API Gateway (¿falta crearla o desplegar la Lambda?).',
  500: 'Error interno del backend. Revisa los logs de la Lambda en CloudWatch.',
  502: 'El API Gateway no pudo invocar la Lambda (revisa la integración y los permisos).',
};

function mensajeDelBackend(body: unknown): string | null {
  if (typeof body === 'string') return body.trim() || null;
  if (!body || typeof body !== 'object') return null;

  const obj = body as Record<string, unknown>;
  const error = typeof obj.error === 'string' ? obj.error : null;
  const hint = typeof obj.hint === 'string' ? obj.hint : null;
  if (error) return hint ? `${error} ${hint}` : error;

  // un "Unauthorized" pelado no dice nada que el codigo no diga ya
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
    // fetch tira TypeError cuando el navegador corta la peticion: casi
    // siempre es cors
    return `No se pudo contactar la API: ${err.message}. Si el método es POST/PUT/PATCH, revisa el CORS del API Gateway.`;
  }

  return err instanceof Error ? err.message : 'Error desconocido';
}
