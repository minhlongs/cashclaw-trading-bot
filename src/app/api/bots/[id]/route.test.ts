// route.test.ts — tests for /api/bots/[id] route handlers
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockBotDetailHandler = vi.fn();
const mockBotControlHandler = vi.fn();

vi.mock('@/forest/api/routes', () => ({
  botDetailHandler: (...args: unknown[]) => mockBotDetailHandler(...args),
  botControlHandler: (...args: unknown[]) => mockBotControlHandler(...args),
}));

const { GET, POST } = await import('./route');

describe('/api/bots/[id] route', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('GET', () => {
    it('returns bot detail', async () => {
      mockBotDetailHandler.mockResolvedValue({ ok: true, bot: { id: 'bot-1' } });
      const req = new Request('http://localhost/api/bots/bot-1');
      const res = await GET(req, { params: Promise.resolve({ id: 'bot-1' }) });
      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      expect(body.ok).toBe(true);
    });
  });

  describe('POST', () => {
    it('returns 400 when action is missing', async () => {
      const req = new Request('http://localhost/api/bots/bot-1', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const res = await POST(req, { params: Promise.resolve({ id: 'bot-1' }) });
      expect(res.status).toBe(400);
      const body = await res.json() as Record<string, unknown>;
      expect(body.error).toBe('Missing action');
    });

    it('executes control action', async () => {
      mockBotControlHandler.mockResolvedValue({ ok: true });
      const req = new Request('http://localhost/api/bots/bot-1', {
        method: 'POST',
        body: JSON.stringify({ action: 'start' }),
      });
      const res = await POST(req, { params: Promise.resolve({ id: 'bot-1' }) });
      expect(res.status).toBe(200);
      expect(mockBotControlHandler).toHaveBeenCalledWith('bot-1', 'start');
    });
  });
});
