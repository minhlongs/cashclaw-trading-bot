import { execFileSync } from 'node:child_process';
import type { D1Database, D1PreparedStatement } from '@/lib/db/types';

type SqlCall = { sql: string; values: unknown[] };
const PYTHON = String.raw`
import json, sqlite3, sys
path=sys.argv[1]
data=json.load(sys.stdin)
conn=sqlite3.connect(path, timeout=30, isolation_level=None)
conn.row_factory=sqlite3.Row
conn.execute('PRAGMA busy_timeout=30000')
def rows(cur): return [dict(row) for row in cur.fetchall()]
def execute(call, mode):
    cur=conn.execute(call['sql'], call.get('values', []))
    result={'meta':{'changes':max(cur.rowcount,0),'last_row_id':cur.lastrowid or 0,'duration':0}}
    if mode=='first': result['row']=dict(row) if (row:=cur.fetchone()) is not None else None
    if mode=='all': result['results']=rows(cur)
    return result
try:
    op=data['op']
    if op=='batch':
        conn.execute('BEGIN IMMEDIATE')
        try:
            result=[execute(call,'run') for call in data['calls']]
            conn.execute('COMMIT')
        except Exception:
            conn.execute('ROLLBACK')
            raise
    elif op=='exec':
        conn.executescript(data['sql'])
        result={'count':0,'duration':0}
    elif op in ('first','all','run'):
        result=execute(data,op)
    else: raise ValueError('unsupported D1 test operation')
    print(json.dumps(result))
except Exception as e:
    print(json.dumps({'error':str(e)}))
    sys.exit(0)
finally:
    conn.close()
`;

function invoke<T>(dbPath: string, payload: Record<string, unknown>): T {
  const raw = execFileSync('python3', ['-c', PYTHON, dbPath], {
    input: JSON.stringify(payload), encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
  });
  const result = JSON.parse(raw) as T & { error?: string };
  if (result.error) throw new Error(result.error);
  return result;
}

class LocalD1Statement implements D1PreparedStatement {
  private values: unknown[] = [];
  constructor(private readonly dbPath: string, private readonly sql: string) {}
  bind(...values: unknown[]): D1PreparedStatement { this.values = values; return this; }
  async first<T>(): Promise<T | null> {
    return invoke<{ row: T | null }>(this.dbPath, { op: 'first', sql: this.sql, values: this.values }).row;
  }
  async firstRow<T>(): Promise<T | null> { return this.first<T>(); }
  async all<T>(): Promise<{ results: T[]; meta: { duration: number } }> {
    const result = invoke<{ results: T[]; meta: { duration: number } }>(this.dbPath, { op: 'all', sql: this.sql, values: this.values });
    return { results: result.results, meta: result.meta };
  }
  async run(): Promise<{ meta: { changes: number; last_row_id: number; duration: number } }> {
    return invoke<{ meta: { changes: number; last_row_id: number; duration: number } }>(this.dbPath, { op: 'run', sql: this.sql, values: this.values });
  }
  toCall(): SqlCall { return { sql: this.sql, values: this.values }; }
}

export class LocalD1Database implements D1Database {
  constructor(readonly dbPath: string) {}
  prepare(sql: string): D1PreparedStatement { return new LocalD1Statement(this.dbPath, sql); }
  async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<T[]> {
    const calls = statements.map((statement) => {
      if (!(statement instanceof LocalD1Statement)) throw new Error('Local D1 batch received a foreign statement');
      return statement.toCall();
    });
    return invoke<T[]>(this.dbPath, { op: 'batch', calls });
  }
  async exec(sql: string): Promise<{ count: number; duration: number }> {
    return invoke<{ count: number; duration: number }>(this.dbPath, { op: 'exec', sql });
  }
  async dump(): Promise<string> { return ''; }
}
