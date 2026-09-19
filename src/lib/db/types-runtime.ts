// Core Cloudflare runtime types (inlined to avoid @cloudflare/workers-types dependency)

export interface KVNamespace {
  get(key: string, options?: { type?: 'text' | 'json' | 'arrayBuffer' | 'stream' | 'boolean' | unknown }): Promise<string | null | undefined>;
  put(key: string, value: string | ArrayBuffer | ReadableStream, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(options?: { json?: boolean }): Promise<T | null>;
  firstRow<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[]; meta: { duration: number } }>;
  run(): Promise<{ meta: { changes: number; last_row_id: number; duration: number } }>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<T[]>;
  exec(query: string): Promise<{ count: number; duration: number }>;
  dump(): Promise<string>;
}

export interface Env {
  DB: D1Database;
  CACHE?: KVNamespace;
}
