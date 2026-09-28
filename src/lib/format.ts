export function formatCLP(value: number): string {
  return Number.isFinite(value)
    ? value.toLocaleString('es-CL', {
        style: 'currency',
        currency: 'CLP',
        maximumFractionDigits: 0,
      })
    : '—';
}

export function formatNumero(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString('es-CL') : '—';
}

// version corta para las tarjetas: $4,2M, $320K
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
