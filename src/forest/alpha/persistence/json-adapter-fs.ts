export const DEFAULT_ALPHA_DIR = 'alpha-artifacts';

export function readFile(path: string): string | null {
  try { return require('fs').readFileSync(path, 'utf-8'); } catch { return null; }
}

export function writeFile(path: string, data: string): void {
  require('fs').mkdirSync(require('path').dirname(path), { recursive: true });
  require('fs').writeFileSync(path, data, 'utf-8');
}

export function fromJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

export function toJson(value: unknown): string {
  return JSON.stringify(value);
}
