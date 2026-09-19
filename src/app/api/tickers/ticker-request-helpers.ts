export function getClientIp(req: Request): string {
  const cfIp = req.headers.get('cf-connecting-ip');
  if (cfIp) return cfIp;
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return 'anonymous';
}

export function parseQueryParams(req: Request): {
  exchange: string | undefined;
  symbol: string | undefined;
} {
  const url = new URL(req.url);
  return {
    exchange: url.searchParams.get('exchange') ?? undefined,
    symbol: url.searchParams.has('symbol') ? url.searchParams.get('symbol') ?? undefined : undefined,
  };
}
