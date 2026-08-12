#!/usr/bin/env bash
# scripts/merge-i18n-pages.sh — Merge landing/cta i18n into messages/{vi,en}.json
# Usage: bash scripts/merge-i18n-pages.sh
set -e
APP_DIR="src/messages"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$REPO_ROOT"

TMP_DIR="/tmp/i18n-merge-$$"
mkdir -p "$TMP_DIR"

# Source JSON files (same as generated earlier)
LANDING_VI="$TMP_DIR/landing_vi.json"
LANDING_EN="$TMP_DIR/landing_en.json"
CTA_VI="$TMP_DIR/cta_vi.json"
CTA_EN="$TMP_DIR/cta_en.json"

cat > "$LANDING_VI" << 'EOF'
{"landing":{"nav":{"logo":"CashClaw","cta":"Bắt đầu ngay"},"hero":{"badge":"🤖 Bot giao dịch tự động","badgeSub":"cho người bận rộn","title":"Chốt lãi tự động","titleLine2":"không cần canh sàn","subtitle":"CashClaw chạy 24/7 trên Binance, Bybit, OKX. Bạn đặt chiến lược, bot chốt lãi — kết quả gửi về Telegram.","cta":"Bắt đầu miễn phí","trust":"🔒 An toàn · Không khoá hợp đồng · Thử nghiệm 7 ngày","link":"Cho nhà phát triển ›"},"features":{"title":"Tại sao chọn CashClaw?","items":[{"icon":"🤖","title":"Bot AI thông minh","desc":"Chiến lược tự động tối ưu chốt lãi, giảm rủi ro nhờ thuật toán nâng cao."},{"icon":"📊","title":"Hiệu quả minh bạch","desc":"Theo dõi toàn bộ lịch sử giao dịch, tối ưu hiệu suất bot."},{"icon":"🔒","title":"An toàn là ưu tiên","desc":"Không khoá hợp đồng, hủy bất cứ lúc nào. Bạn hoàn toàn làm chủ."},{"icon":"💼","title":"Linh hoạt mọi mục tiêu","desc":"Phù hợp đầu tư ngắn, trung và dài hạn. Tùy chỉnh theo chiến lược của bạn."}]},"stats":{"label":"Hiệu quả đã được chứng minh","items":[{"value":"$500+","label":"Vốn tối thiểu"},{"value":"2–10%","label":"Lợi nhuận mục tiêu/tháng"},{"value":"24/7","label":"Chạy tự động không ngừng"},{"value":"100%","label":"Bạn làm chủ tiền của mình"}]},"steps":{"title":"Bắt đầu chỉ 3 bước","items":[{"n":"01","title":"Chọn chiến lược","desc":"Grid hoặc Mean Reversion — phù hợp với mục tiêu của bạn."},{"n":"02","title":"Nạp tiền","desc":"Nạp tiền vào tài khoản giao dịch của bạn."},{"n":"03","title":"Nhận kết quả","desc":"Ngồi lại và theo dõi bot tự động chạy, gửi báo cáo qua Telegram."}]},"pricing":{"title":"Gói dịch vụ","plans":[{"name":"Starter","price":"99K","unit":"/ngày","features":["Vốn: từ $500","Grid","Hỗ trợ Email"],"cta":"Bắt đầu"},{"name":"Pro","price":"199K","unit":"/ngày","features":["Vốn: từ $1,000","Grid + Mean Rev","Telegram 1-1"],"cta":"Bắt đầu","popular":true}]},"testimonial":{"quote":"CashClaw tiết kiệm thời gian và tối ưu lợi nhuận. Tôi không còn phải canh sàn 24/7.","author":"Nguyễn Văn A","role":"Nhà đầu tư"},"cta":{"title":"Sẵn sàng giao dịch tự động?","subtitle":"Thử nghiệm 7 ngày miễn phí. Không ràng buộc.","button":"Đăng ký ngay"},"footer":{"product":"CashClaw","copyright":"© 2026 CashClaw"}}}
EOF

cat > "$LANDING_EN" << 'EOF'
{"landing":{"nav":{"logo":"CashClaw","cta":"Get Started"},"hero":{"badge":"🤖 Automated Trading Bot","badgeSub":"for busy people","title":"Auto-profit","titleLine2":"without watching charts","subtitle":"CashClaw runs 24/7 on Binance, Bybit, OKX. Set your strategy, the bot books profits — results sent to Telegram.","cta":"Start Free","trust":"🔒 Safe · No lock-in · 7-day trial","link":"For developers ›"},"features":{"title":"Why CashClaw?","items":[{"icon":"🤖","title":"Smart AI Bots","desc":"Auto-optimized strategies to maximize gains and reduce risk."},{"icon":"📊","title":"Transparent Performance","desc":"Full trade history and bot performance at a glance."},{"icon":"🔒","title":"Safety First","desc":"No contracts, cancel anytime. You're always in control."},{"icon":"💼","title":"Flexible for Any Goal","desc":"Short, medium, or long-term investing fully customizable."}]},"stats":{"label":"Proven Performance","items":[{"value":"$500+","label":"Minimum capital"},{"value":"2–10%","label":"Target monthly return"},{"value":"24/7","label":"Runs non-stop"},{"value":"100%","label":"Your money, your control"}]},"steps":{"title":"Start in 3 Steps","items":[{"n":"01","title":"Choose Strategy","desc":"Grid or Mean Reversion — pick what fits your goals."},{"n":"02","title":"Fund Account","desc":"Deposit funds into your trading account."},{"n":"03","title":"Get Results","desc":"Relax while the bot runs and sends reports to Telegram."}]},"pricing":{"title":"Pricing","plans":[{"name":"Starter","price":"$25","unit":"/day","features":["Capital: from $500","Grid","Email support"],"cta":"Start"},{"name":"Pro","price":"$49","unit":"/day","features":["Capital: from $1,000","Grid + Mean Rev","1-1 Telegram"],"cta":"Start","popular":true}]},"testimonial":{"quote":"CashClaw saves me time and optimizes returns. No more watching charts 24/7.","author":"Nguyen Van A","role":"Crypto Investor"},"cta":{"title":"Ready to trade automatically?","subtitle":"7-day free trial. No commitment.","button":"Sign Up Now"},"footer":{"product":"CashClaw","copyright":"© 2026 CashClaw"}}}
EOF

cat > "$CTA_VI" << 'EOF'
{"cta":{"nav":{"logo":"CashClaw","back":"← Quay lại"},"hero":{"icon":"🚀","title":"Bắt đầu ngay","subtitle":"Tạo bot đầu tiên trong vài phút. Chúng tôi hướng dẫn từng bước.","note":"Nền tảng vận hành trên Cloudflare — an toàn, nhanh, toàn cầu."},"whatNext":{"title":"Điều gì xảy ra tiếp theo?","items":[{"icon":"📋","title":"Chọn chiến lược","desc":"Grid hoặc Mean Reversion — bạn chọn phù hợp mục tiêu."},{"icon":"🔌","title":"Kết nối sàn","desc":"Nhập API key Binance/Bybit/OKX — được mã hoá, lưu an toàn."},{"icon":"▶️","title":"Chạy paper trading","desc":"Thử nghiệm 7 ngày không tốn tiền thật — xem kết quả trước khi live."},{"icon":"📈","title":"Thu lãi","desc":"Bot chạy tự động, bạn nhận báo cáo qua Telegram mỗi ngày."}]},"guarantee":{"icon":"🛡️","title":"Cam kết của chúng tôi","items":["Không khoá hợp đồng — hủy bất cứ lúc nào","API key của bạn được mã hoá, chúng tôi không thể rút tiền","Thử nghiệm 7 ngày miễn phí, dùng paper trading trước","Hỗ trợ Telegram 1-1 cho gói Pro"]},"cta":{"button":"Đăng ký & tạo bot đầu tiên","note":"Không cần thẻ tín dụng để bắt đầu."}}}
EOF

cat > "$CTA_EN" << 'EOF'
{"cta":{"nav":{"logo":"CashClaw","back":"← Back"},"hero":{"icon":"🚀","title":"Get Started Now","subtitle":"Create your first bot in minutes. We'll guide you step-by-step.","note":"Powered by Cloudflare — safe, fast, worldwide."},"whatNext":{"title":"What happens next?","items":[{"icon":"📋","title":"Pick a Strategy","desc":"Grid or Mean Reversion — choose what fits your goals."},{"icon":"🔌","title":"Connect Exchange","desc":"Enter Binance/Bybit/OKX API key — encrypted, safe storage."},{"icon":"▶️","title":"Run Paper Trading","desc":"7-day free trial with simulated funds — see results before going live."},{"icon":"📈","title":"Earn Profit","desc":"Bot runs 24/7, you get daily reports via Telegram."}]},"guarantee":{"icon":"🛡️","title":"Our Commitment","items":["No lock-in contract — cancel anytime","Your API key is encrypted — we cannot withdraw funds","7-day free trial with paper trading first","1-1 Telegram support for Pro plan"]},"cta":{"button":"Sign Up & Create First Bot","note":"No credit card required to start."}}}
EOF

echo "✅ Source JSON files ready in $TMP_DIR"

# ── Merge helper: deep-merge JSON files using Node ──
merge_json() {
  node -e "
    const fs = require('fs');
    const target = JSON.parse(fs.readFileSync('$1','utf8'));
    const add = JSON.parse(fs.readFileSync('$2','utf8'));
    function deepMerge(t, a) {
      for (const k of Object.keys(a)) {
        if (k in t && typeof t[k] === 'object' && !Array.isArray(t[k]) && typeof a[k] === 'object' && !Array.isArray(a[k])) {
          deepMerge(t[k], a[k]);
        } else {
          t[k] = a[k];
        }
      }
    }
    deepMerge(target, add);
    fs.writeFileSync('$1', JSON.stringify(target, null, 2) + '\n');
  "
}

# Merge landing i18n
merge_json "$APP_DIR/vi.json" "$LANDING_VI"
merge_json "$APP_DIR/en.json" "$LANDING_EN"
echo "✅ landing i18n merged"

# Merge CTA i18n
merge_json "$APP_DIR/vi.json" "$CTA_VI"
merge_json "$APP_DIR/en.json" "$CTA_EN"
echo "✅ cta i18n merged"

echo ""
echo "=== Files ready to create ==="
echo "Landing: src/app/\(landing\)/"
echo "  page.tsx    — Server Component"
echo "  LandingClient.tsx — Client Component"
echo ""
echo "CTA: src/app/\(landing\)/get-started/"
echo "  page.tsx    — Server Component"
echo "  CtaClient.tsx — Client Component"
echo ""
echo "To create files: run create-landing-files.sh"
