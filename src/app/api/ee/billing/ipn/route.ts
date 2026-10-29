import { handleNowPaymentsIpn } from '../nowpayments-ipn/handler';

export async function POST(req: Request) {
  return handleNowPaymentsIpn(req);
}
