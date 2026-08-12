# Scope Confirmation — trade-bot v1

**Date:** 2026-08-12  
**Decision:** v1 scope = **Paper-mode-only**  
**Live mode:** Separate milestone (post-CCXT research + D1 provisioning)

## Rationale
- Pipeline "GO-LIVE" achieved auth guard + version endpoint, but customer journey not yet verified (UI returns 401, no dashboard, no login)
- Paper-mode leverages existing `src/tree/exchange/paper/index.ts` (simulated exchange, no real money, no CCXT needed)
- Avoids blocking on CCXT compatibility research on Cloudflare Workers (unresearched, high-risk for v1)
- Enables fastest hand-over: ~2 days vs ~2 weeks with Live path
- Live mode can be v2 milestone with explicit customer re-confirmation

## Acceptance criteria
- [x] Decision recorded in `plans/`
- [x] No Live mode UI/CCXT/D1 work started until separate milestone
- [x] All subsequent steps scoped against Paper-only v1
- [x] Live mode can be re-activated after: CCXT compatibility verified on Workers, D1 provisioned, Live trading engine wired, customer explicitly opts-in

## Next steps (against Paper-only v1)

| Step | Action | Owner | ETA |
|------|--------|-------|-----|
| 2 | Choose UI architecture: OpenNext (Next.js on same Worker) vs Cloudflare Pages separate | — | Start |
| 3 | Research CCXT on CF Workers (quick yes/no) | — | Start |
| 4 | Provision D1 database, run migration, wire settings/actions.ts | — | After Step 3 |
| 5 | Wire login mínimo (email+passcode or magic link) cho 1 khách non-tech | — | After Step 4 |
| 6 | Viết doc bilingual VI/EN + 1 buổi walkthrough giám sát | — | After Step 5 |
| 7 | Optional: Live mode v2 — sau khi CCXT x verified | — | Separate milestone |

## Paper-mode feature map (v1)
- `src/tree/exchange/paper/index.ts` — already exists, simulate buy/sell/balance
- Dashboard hiển thị lịch sử trade (tạo ra qua Paper mode, lưu D1)
- Settings: nhập API key sàn (validate, mã hóa lưu D1), risk limits, bật/tắt bot
- Killswitch: bấm một lần → dừng bot, không mất dữ liệu
- Không có route nào cho phép Live trading v1
- ADMIN_TOKEN vẫn dùng cho ops/internal API, không phải login khách

## Escrow (will be populated as work progresses)
- [ ] E1: Test VERSION='' fallback
- [ ] E2: Test XSS-shaped VERSION serialization  
- [ ] E3: Test VERSION >7 char truncation
- [ ] E4: Verify catch{} fallback behavior