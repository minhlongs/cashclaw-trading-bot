// Controllable fake outbound receiver for PR35 verification harnesses.
// An HTTP receiver under test-harness control: counts every request independently of the database
// so tests can compare "requests that actually arrived" vs "attempts recorded". Modes simulate
// provider behavior without any real provider call:
//   ok     — respond 200 {ok:true} (provider accepted)
//   fail500 — respond 503 with Retry-After (retryable provider failure)
//   hang   — accept the request and NEVER respond (client times out => ambiguous 'unknown' outcome)
//   drop   — read the request then destroy the socket (response lost => ambiguous)
// This module is verification infrastructure only; it is never imported by src/ production code.

import { createServer } from 'node:http';

export function startFakeReceiver(port) {
  const state = {
    mode: 'ok',
    totalRequests: 0,
    requests: [],
  };
  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname === '/__state') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ mode: state.mode, totalRequests: state.totalRequests, requests: state.requests.slice(-50) }));
        return;
      }
      if (url.pathname === '/__mode' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
          try { state.mode = JSON.parse(body || '{}').mode ?? 'ok'; } catch { /* keep current mode */ }
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ ok: true, mode: state.mode }));
        });
        return;
      }
      if (url.pathname === '/__reset' && req.method === 'POST') {
        state.totalRequests = 0;
        state.requests = [];
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      // Inbound "provider" traffic.
      state.totalRequests += 1;
      state.requests.push({
        at: Date.now(),
        method: req.method,
        path: url.pathname,
        eventId: req.headers['x-cashclaw-event-id'] ?? null,
        idempotencyKey: req.headers['idempotency-key'] ?? null,
        bodyPreview: Buffer.concat(chunks).toString('utf8').slice(0, 200),
      });
      if (state.mode === 'hang') return; // never respond — the client times out (ambiguous outcome)
      if (state.mode === 'drop') { req.socket.destroy(); return; } // response lost (ambiguous)
      if (state.mode === 'fail500') {
        res.writeHead(503, { 'content-type': 'application/json', 'retry-after': '0' });
        res.end(JSON.stringify({ ok: false, error: 'synthetic provider failure' }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve({ server, state, port }));
  });
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.argv[2] ?? 8791);
  startFakeReceiver(port).then(() => console.log(`fake receiver listening on 127.0.0.1:${port}`));
}
