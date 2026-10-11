export async function handleBinanceResponse<T>(res: Response, endpoint: string): Promise<T> {
  if (!res.ok) {
    let errorDetail = '';
    try {
      const rawText = await res.text();
      if (rawText) {
        try {
          const errJson = JSON.parse(rawText) as { code?: number; msg?: string };
          if (errJson && typeof errJson === 'object') {
            errorDetail = errJson.msg ? ` [code: ${errJson.code ?? 'unknown'}]: ${errJson.msg}` : `: ${JSON.stringify(errJson)}`;
          }
        } catch {
          errorDetail = `: ${rawText}`;
        }
      }
    } catch {
      // ignore read errors
    }
    throw new Error(`Binance REST ${res.status} on ${endpoint}${errorDetail}`);
  }
  return (await res.json()) as T;
}
