// JSON artifact writer for the real-data pairs verdict script.
// Only I/O seam of the verdict pipeline besides the data fetch.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { REPORT_DIR } from './rv-pairs-verdict-protocol';

export function writeArtifact(name: string, payload: unknown): void {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const out = path.join(REPORT_DIR, name);
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));
  console.log(`artifact: ${out}`);
}
