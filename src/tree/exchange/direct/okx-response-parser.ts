import type { OkxResponse } from './types';

export class OkxResponseParser {
  public static async handleResponse<T>(res: Response, endpoint: string): Promise<OkxResponse<T>> {
    if (!res.ok) {
      let detail = '';
      try {
        const text = await res.text();
        if (text) {
          try {
            const err = JSON.parse(text) as { code?: string; msg?: string };
            detail = err?.msg ? ` [code: ${err.code ?? 'unknown'}]: ${err.msg}` : `: ${text}`;
          } catch {
            detail = `: ${text}`;
          }
        }
      } catch {
        // stream read ignored
      }
      throw new Error(`OKX REST ${res.status} on ${endpoint}${detail}`);
    }
    const data = (await res.json()) as OkxResponse<T>;
    if (data.code !== '0') {
      throw new Error(`OKX REST error [code: ${data.code}]: ${data.msg}`);
    }
    return data;
  }
}
