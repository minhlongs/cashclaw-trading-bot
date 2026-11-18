import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '../..');
const SRC_ROOT = path.resolve(REPO_ROOT, 'src');

const AUDITED_SERVER_ACTION_MODULES = new Set(['src/forest/backtest/actions.ts']);
const AUDITED_SERVER_ACTION_EXPORTS = new Set([
  'src/forest/backtest/actions.ts#runBacktestAction',
  'src/forest/backtest/actions.ts#getBacktestResults',
]);

const INTERNAL_SERVER_ONLY_MODULES = new Set([
  'src/forest/settings/actions.ts',
  'src/forest/dashboard/actions.ts',
  'src/forest/dashboard/bot-actions.ts',
  'src/forest/dashboard/bot-detail.ts',
  'src/forest/dashboard/bot-kpis.ts',
  'src/forest/dashboard/capital-snapshots.ts',
  'src/forest/dashboard/exchange-health.ts',
  'src/forest/dashboard/trade-events.ts',
]);

function walkTsFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkTsFiles(fullPath));
    } else if (
      (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.test.tsx')
    ) {
      results.push(fullPath);
    }
  }
  return results;
}

function toRepoRel(absPath: string): string {
  return path.relative(REPO_ROOT, absPath).replace(/\\/g, '/');
}

function resolveRuntimeTarget(fromAbs: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith('@/')) {
    base = path.join(SRC_ROOT, specifier.slice(2));
  } else if (specifier.startsWith('.')) {
    base = path.resolve(path.dirname(fromAbs), specifier);
  } else {
    return null;
  }
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return toRepoRel(candidate);
    }
  }
  return null;
}

function isTypeOnlyImportClause(clause: ts.ImportClause | undefined): boolean {
  if (!clause) return false;
  if (clause.isTypeOnly) return true;
  if (clause.name || !clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) {
    return false;
  }
  return (
    clause.namedBindings.elements.length > 0 &&
    clause.namedBindings.elements.every((el) => el.isTypeOnly)
  );
}

function extractNodeRuntimeSpecifier(node: ts.Node): string | null {
  if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
    return isTypeOnlyImportClause(node.importClause) ? null : node.moduleSpecifier.text;
  }
  if (
    ts.isExportDeclaration(node) &&
    !node.isTypeOnly &&
    node.moduleSpecifier &&
    ts.isStringLiteral(node.moduleSpecifier)
  ) {
    return node.moduleSpecifier.text;
  }
  if (
    ts.isCallExpression(node) &&
    node.expression.kind === ts.SyntaxKind.ImportKeyword &&
    node.arguments[0] &&
    ts.isStringLiteral(node.arguments[0])
  ) {
    return node.arguments[0].text;
  }
  return null;
}

function collectRuntimeImports(absPath: string, sourceText: string): string[] {
  const sf = ts.createSourceFile(
    absPath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    absPath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const targets: string[] = [];

  const visit = (node: ts.Node): void => {
    const spec = extractNodeRuntimeSpecifier(node);
    if (spec) {
      const resolved = resolveRuntimeTarget(absPath, spec);
      if (resolved) targets.push(resolved);
    }
    ts.forEachChild(node, visit);
  };

  visit(sf);
  return targets;
}

describe('P1-01 Server Action surface & identity-provenance invariant', () => {
  it('restricts "use server" directives strictly to audited Server Action modules', () => {
    const useServerFiles: string[] = [];
    for (const absPath of walkTsFiles(SRC_ROOT)) {
      const content = fs.readFileSync(absPath, 'utf8');
      if (/^\s*['"]use server['"]\s*;?/m.test(content)) {
        useServerFiles.push(toRepoRel(absPath));
      }
    }
    expect(useServerFiles.sort()).toEqual([...AUDITED_SERVER_ACTION_MODULES].sort());
  });

  it('forbids caller-supplied identity parameters or DTO fields via TypeScript type-checker and forbids x-user-id reads', () => {
    const forbiddenNames = new Set([
      'userId',
      'user_id',
      'workspaceId',
      'workspace_id',
      'tenantId',
      'tenant_id',
      'email',
      'x-user-id',
    ]);
    const absModules = [...AUDITED_SERVER_ACTION_MODULES].map((rel) => path.resolve(REPO_ROOT, rel));
    const compilerOptions: ts.CompilerOptions = {
      target: ts.ScriptTarget.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      baseUrl: REPO_ROOT,
      paths: { '@/*': ['src/*'] },
      types: [],
      noLib: true,
      skipLibCheck: true,
      skipDefaultLibCheck: true,
    };
    const defaultHost = ts.createCompilerHost(compilerOptions);
    const localSourceHost: ts.CompilerHost = {
      ...defaultHost,
      resolveModuleNameLiterals(moduleLiterals, containingFile, _redirected, options) {
        return moduleLiterals.map((lit) => {
          const text = lit.text;
          if (!text.startsWith('.') && !text.startsWith('@/') && !text.startsWith('/')) {
            return { resolvedModule: undefined };
          }
          const resolved = ts.resolveModuleName(text, containingFile, options, defaultHost);
          if (resolved.resolvedModule?.resolvedFileName.includes('node_modules')) {
            return { resolvedModule: undefined };
          }
          return resolved;
        });
      },
    };
    const program = ts.createProgram(absModules, compilerOptions, localSourceHost);
    const checker = program.getTypeChecker();

    const assertNoForbiddenDtoFields = (
      type: ts.Type,
      anchor: ts.Node,
      visited = new Set<ts.Type>(),
    ): void => {
      if (visited.has(type)) return;
      visited.add(type);
      if (type.isUnionOrIntersection()) {
        for (const member of type.types) {
          assertNoForbiddenDtoFields(member, anchor, visited);
        }
      }
      if ((type.flags & (ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike | ts.TypeFlags.BooleanLike)) !== 0) {
        return;
      }
      for (const propSym of checker.getPropertiesOfType(type)) {
        expect(forbiddenNames.has(propSym.getName())).toBe(false);
        const propType = checker.getTypeOfSymbolAtLocation(propSym, propSym.valueDeclaration ?? anchor);
        assertNoForbiddenDtoFields(propType, anchor, visited);
      }
    };

    for (const absPath of absModules) {
      const content = fs.readFileSync(absPath, 'utf8');
      expect(content).not.toMatch(/x-user-id/i);
      expect(content).not.toMatch(/from\s+['"]next\/headers['"]/);

      const sf = program.getSourceFile(absPath);
      expect(sf).toBeDefined();
      const moduleSymbol = sf ? checker.getSymbolAtLocation(sf) : undefined;
      const exports = moduleSymbol ? checker.getExportsOfModule(moduleSymbol) : [];
      const valueExports = exports.filter(
        (sym) => (sym.flags & (ts.SymbolFlags.Function | ts.SymbolFlags.Variable | ts.SymbolFlags.Alias)) !== 0,
      );

      let callableExportCount = 0;
      for (const expSym of valueExports) {
        const expType = checker.getTypeOfSymbolAtLocation(expSym, sf!);
        const callSigs = expType.getCallSignatures();
        if (callSigs.length === 0) continue;
        callableExportCount += 1;

        for (const sig of callSigs) {
          for (const paramSym of sig.getParameters()) {
            expect(forbiddenNames.has(paramSym.getName())).toBe(false);
            const paramType = checker.getTypeOfSymbolAtLocation(paramSym, paramSym.valueDeclaration ?? sf!);
            assertNoForbiddenDtoFields(paramType, sf!);
          }
        }
      }
      expect(callableExportCount).toBeGreaterThan(0);
    }
  }, 30_000);

  it('forbids x-user-id header reads inside backtest session-resolution helpers', () => {
    const persistSource = fs.readFileSync(
      path.resolve(SRC_ROOT, 'forest/backtest/actions-persist.ts'),
      'utf8',
    );
    expect(persistSource).not.toMatch(/x-user-id/i);
    expect(persistSource).not.toMatch(/\bheaders\s*\(/);
  });

  it('enforces server-only boundary: zero "use client" modules import internal forest service modules directly or transitively', () => {
    const runtimeGraph = new Map<string, string[]>();
    const clientEntries: string[] = [];

    for (const absPath of walkTsFiles(SRC_ROOT)) {
      const rel = toRepoRel(absPath);
      const content = fs.readFileSync(absPath, 'utf8');
      if (/^\s*['"]use client['"]\s*;?/m.test(content)) {
        clientEntries.push(rel);
      }
      runtimeGraph.set(rel, collectRuntimeImports(absPath, content));
    }

    expect(clientEntries.length).toBeGreaterThan(0);
    const violations: string[] = [];

    for (const clientFile of clientEntries) {
      const visited = new Set<string>([clientFile]);
      const queue: Array<{ file: string; chain: string[] }> = [
        { file: clientFile, chain: [clientFile] },
      ];
      while (queue.length > 0) {
        const current = queue.shift()!;
        for (const dep of runtimeGraph.get(current.file) ?? []) {
          const nextChain = [...current.chain, dep];
          if (INTERNAL_SERVER_ONLY_MODULES.has(dep)) {
            violations.push(nextChain.join(' -> '));
          }
          if (!visited.has(dep)) {
            visited.add(dep);
            queue.push({ file: dep, chain: nextChain });
          }
        }
      }
    }

    expect(violations).toEqual([]);
  }, 30_000);

  it('verifies compiled Next/OpenNext server-reference-manifest.json exposes only audited Server Actions when built', () => {
    const nextDir = `${'.'}next`;
    const manifestCandidates = [
      path.join(REPO_ROOT, '.open-next', 'server-functions', 'default', nextDir, 'server', 'server-reference-manifest.json'),
      path.join(REPO_ROOT, nextDir, 'server', 'server-reference-manifest.json'),
    ].filter((p) => fs.existsSync(p));

    for (const manifestPath of manifestCandidates) {
      const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
        node?: Record<string, { filename?: string; exportedName?: string }>;
        edge?: Record<string, { filename?: string; exportedName?: string }>;
      };
      const entries = [
        ...Object.values(parsed.node ?? {}),
        ...Object.values(parsed.edge ?? {}),
      ];
      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries) {
        const key = `${entry.filename ?? ''}#${entry.exportedName ?? ''}`;
        expect(AUDITED_SERVER_ACTION_EXPORTS.has(key)).toBe(true);
        expect(INTERNAL_SERVER_ONLY_MODULES.has(entry.filename ?? '')).toBe(false);
      }
    }
  });
});
