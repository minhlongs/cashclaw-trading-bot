# Phase 3: Public SDK Packaging, CLI Binary & DX

**Mục tiêu:** Cung cấp CLI executable `bin/cashclaw.js`, kịch bản `npm run quickstart`, kiểm thử CLI và tài liệu developer quickstart cho cộng đồng định lượng.

## Danh sách công việc (Tasks)
- [ ] task-11: Tạo CLI executable nhị phân `bin/cashclaw.js` hỗ trợ các lệnh `quickstart`, `eval`, `export-sync`
- [ ] task-12: Bổ sung cấu hình `"bin"` và script `"quickstart"` vào `package.json`
- [ ] task-13: Viết test suite kiểm thử CLI `bin/__tests__/cashclaw-cli.test.ts`
- [ ] task-14: Soạn thảo tài liệu hướng dẫn nhanh `docs/developer-quickstart.md` (Song ngữ Việt / Anh)
- [ ] task-15: Chạy toàn bộ kiểm định chất lượng (`npm run type-check`, `npm run lint`, `npm test`) và commit git sạch sẽ

## Chi tiết kỹ thuật
- Tương thích Node.js CLI chuẩn qua `#!/usr/bin/env node`.
- Hỗ trợ format bảng màu sắc và output dạng JSON (`--json`).
- Bao hàm CTA dẫn đường lên CashClaw Cloud SaaS.
