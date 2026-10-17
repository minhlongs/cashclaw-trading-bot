// Audit script for Public Open-Source Packaging & Leak Prevention
// Verifies that published artifact files & package exports never leak src/ee/ or proprietary assets.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
const REPO_ROOT = path.resolve(dirname, '..');

export interface AuditReport {
  readonly clean: boolean;
  readonly checkedFilesCount: number;
  readonly errors: readonly string[];
}

export function auditPackageSanity(): AuditReport {
  const errors: string[] = [];
  const npmignorePath = path.join(REPO_ROOT, '.npmignore');

  if (!fs.existsSync(npmignorePath)) {
    errors.push('Missing .npmignore configuration file');
  } else {
    const npmignore = fs.readFileSync(npmignorePath, 'utf8');
    const requiredPatterns = ['src/ee/', '.claude/', '.agentkit/', '.env'];
    for (const pat of requiredPatterns) {
      if (!npmignore.includes(pat)) {
        errors.push(`.npmignore is missing critical exclusion pattern: ${pat}`);
      }
    }
  }

  const packageJsonPath = path.join(REPO_ROOT, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as Record<string, unknown>;

  const exportsField = pkg.exports as Record<string, string> | undefined;
  if (!exportsField || typeof exportsField !== 'object') {
    errors.push('package.json missing exports mapping');
  } else {
    for (const [key, target] of Object.entries(exportsField)) {
      if (typeof target === 'string' && target.includes('src/ee')) {
        errors.push(`Package export "${key}" dangerously references proprietary path: ${target}`);
      }
    }
  }

  const binPath = path.join(REPO_ROOT, 'bin/cashclaw.js');
  let checkedCount = 2;
  if (fs.existsSync(binPath)) {
    checkedCount += 1;
    const binContent = fs.readFileSync(binPath, 'utf8');
    const eeImportRegex = /(?:require|import)\s*\(?['"][^'"]*ee[^'"]*['"]\)?/;
    if (eeImportRegex.test(binContent)) {
      errors.push('CLI entry point bin/cashclaw.js contains import/require to proprietary src/ee');
    }
  }

  return {
    clean: errors.length === 0,
    checkedFilesCount: checkedCount,
    errors,
  };
}

if (process.argv[1] && process.argv[1].endsWith('audit-oss-package.ts')) {
  const report = auditPackageSanity();
  if (!report.clean) {
    process.stderr.write(`Audit failed with ${report.errors.length} errors:\n`);
    for (const err of report.errors) {
      process.stderr.write(` - ${err}\n`);
    }
    process.exit(1);
  } else {
    process.stdout.write(`Package audit clean: ${report.checkedFilesCount} checks passed.\n`);
  }
}
