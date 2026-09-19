export function formatCurrency(val: number): string {
  if (!Number.isFinite(val)) return '$0.00';
  const decimals = val < 1 ? 4 : 2;
  return `$${val.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function formatVolume(val: number): string {
  if (!Number.isFinite(val)) return '0.00';
  return val.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
