// src/lib/format.ts
// Formato de números para la interfaz, en una sola parte.

/** Pesos chilenos, sin decimales: $499.990 */
export function formatCLP(value: number): string {
  return Number.isFinite(value)
    ? value.toLocaleString('es-CL', {
        style: 'currency',
        currency: 'CLP',
        maximumFractionDigits: 0,
      })
    : '—';
}

/** Miles con separador: 1.284 */
export function formatNumero(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString('es-CL') : '—';
}

/**
 * Montos grandes compactos para las tarjetas de KPI: $4,2M, $320K.
 * Bajo 100.000 se muestra el valor completo, que todavía cabe.
 */
export function formatCompacto(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) >= 1_000_000) {
    return `$${(value / 1_000_000).toLocaleString('es-CL', { maximumFractionDigits: 1 })}M`;
  }
  if (Math.abs(value) >= 100_000) {
    return `$${Math.round(value / 1000).toLocaleString('es-CL')}K`;
  }
  return formatCLP(value);
}
