// Gate G11 (§12.1.3 & §15.2): Vietnam Domestic Crypto-Checkout Compliance Block
// Rejects cryptocurrency subscription settlement from VN jurisdiction with HTTP 451
// per Vietnam Law on Digital Technology Industry 71/2025/QH15, Decree 284/2026/ND-CP,
// and State Bank of Vietnam domestic payment regulations.

export const VN_CRYPTO_BLOCK_CODE = 'CRYPTO_CHECKOUT_BLOCKED_VN_JURISDICTION' as const;

export type VnJurisdictionSource =
  | 'cf-ipcountry'
  | 'x-country-code'
  | 'x-vercel-ip-country'
  | 'cf-object'
  | 'billingCountry';

export type VnJurisdictionCheckResult =
  | { readonly blocked: false }
  | {
      readonly blocked: true;
      readonly status: 451;
      readonly code: typeof VN_CRYPTO_BLOCK_CODE;
      readonly jurisdiction: 'VN';
      readonly source: VnJurisdictionSource;
      readonly messageEn: string;
      readonly messageVi: string;
      readonly error: string;
    };

function isVietnamCountryToken(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  const normalized = raw.trim().toUpperCase();
  return normalized === 'VN' || normalized === 'VNM' || normalized === 'VIETNAM';
}

export function inspectVnCryptoCheckoutBlock(
  req: Request,
  billingCountry?: string | null,
): VnJurisdictionCheckResult {
  const candidates: ReadonlyArray<readonly [VnJurisdictionSource, unknown]> = [
    ['cf-ipcountry', req.headers.get('cf-ipcountry')],
    ['x-country-code', req.headers.get('x-country-code')],
    ['x-vercel-ip-country', req.headers.get('x-vercel-ip-country')],
    ['cf-object', (req as unknown as { cf?: { country?: unknown } }).cf?.country],
    ['billingCountry', billingCountry],
  ];

  for (const [source, value] of candidates) {
    if (isVietnamCountryToken(value)) {
      const messageEn =
        'Cryptocurrency subscription settlement is unavailable in Vietnam (VN) pursuant to Law 71/2025/QH15, Decree 284/2026/ND-CP, and SBV domestic payment rules. Please request lawful fiat/enterprise invoicing (VND/USD bank transfer).';
      const messageVi =
        'Thanh toán gói cước bằng tài sản mã hóa không khả dụng tại lãnh thổ Việt Nam (VN) theo Luật Công nghiệp Công nghệ số 71/2025/QH15, Nghị định 284/2026/NĐ-CP và quy định thanh toán của NHNN. Vui lòng sử dụng hóa đơn chuyển khoản doanh nghiệp hợp pháp (VND/USD).';
      return {
        blocked: true,
        status: 451,
        code: VN_CRYPTO_BLOCK_CODE,
        jurisdiction: 'VN',
        source,
        messageEn,
        messageVi,
        error: `${VN_CRYPTO_BLOCK_CODE}: ${messageEn} | ${messageVi}`,
      };
    }
  }

  return { blocked: false };
}
