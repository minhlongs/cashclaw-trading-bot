// Cloudflare Worker types and ExportedHandler interface contracts
import type { WorkerEnv } from './worker-env';

export interface ScheduledEvent {
  scheduledTime: number;
  cron?: string;
}

export interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

export interface ExportedHandler<E = WorkerEnv> {
  fetch?: (request: Request, env: E, ctx: ExecutionContext) => Response | Promise<Response>;
  scheduled?: (event: ScheduledEvent, env: E, ctx: ExecutionContext) => Promise<void>;
}

export type FetchHandler = (
  request: Request,
  env: WorkerEnv,
  ctx?: ExecutionContext
) => Promise<Response> | Response;

export type ScheduledHandler = (
  event: ScheduledEvent,
  env: WorkerEnv,
  ctx?: ExecutionContext
) => Promise<void>;
