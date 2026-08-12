/* CTA page constants — single source of truth copied into vi/en.json.

   History proves inline JSON strings drift out of sync with translations.
   Fix: export constants here, keep JSON as alias during migration.
 */

export const CTA_HERO_ICON = "🚀";
export const CTA_GUARANTEE_ICON = "🛡️";

export const CTA_STEPS = [
  { icon: "📋", vi: "Chọn chiến lược", en: "Pick a Strategy", viDesc: "Grid hoặc Mean Reversion — bạn chọn phù hợp mục tiêu.", enDesc: "Grid or Mean Reversion — choose what fits your goals." },
  { icon: "🔌", vi: "Kết nối sàn", en: "Connect Exchange", viDesc: "Nhập API key Binance/Bybit/OKX — được mã hoá, lưu an toàn.", enDesc: "Enter Binance/Bybit/OKX API key — encrypted, safe storage." },
  { icon: "▶️", vi: "Chạy paper trading", en: "Run Paper Trading", viDesc: "Thử nghiệm 7 ngày không tốn tiền thật — xem kết quả trước khi live.", enDesc: "7-day free trial with simulated funds — see results before going live." },
  { icon: "📈", vi: "Thu lãi", en: "Earn Profit", viDesc: "Bot chạy tự động, bạn nhận báo cáo qua Telegram mỗi ngày.", enDesc: "Bot runs 24/7, you get daily reports via Telegram." },
] as const;

export const CTA_GUARANTEE_VI = [
  "Không khoá hợp đồng — hủy bất cứ lúc nào",
  "API key của bạn được mã hoá, chúng tôi không thể rút tiền",
  "Thử nghiệm 7 ngày miễn phí, dùng paper trading trước",
  "Hỗ trợ Telegram 1-1 cho gói Pro",
];

export const CTA_GUARANTEE_EN = [
  "No lock-in contract — cancel anytime",
  "Your API key is encrypted — we cannot withdraw funds",
  "7-day free trial with paper trading first",
  "1-1 Telegram support for Pro plan",
];
