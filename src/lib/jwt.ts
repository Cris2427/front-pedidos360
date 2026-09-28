// solo abre el token para mirarlo, no valida la firma

export interface JwtClaims {
  aud?: string;
  iss?: string;
  scp?: string;
  roles?: string[];
  exp?: number;
  iat?: number;
  [key: string]: unknown;
}

export function decodeJwt(token: string): JwtClaims | null {
  try {
    const payload = token.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as JwtClaims;
  } catch {
    return null;
  }
}

export function scopesOf(claims: JwtClaims | null): string[] {
  if (!claims?.scp) return [];
  return claims.scp.split(' ').filter(Boolean);
}
