import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/db/client';
import { WorkspaceContextError } from '@/ee/tenancy/workspace-request-context';
import { verifyNowPaymentsIpnHttpRequest } from '@/ee/billing/nowpayments-ipn-verifier';
import { canonicalizeNowPaymentsJson } from '@/ee/billing/nowpayments-ipn';
import { processVerifiedNowPaymentsEvent } from '@/ee/billing/nowpayments-order-store';

export async function handleNowPaymentsIpn(req: Request): Promise<NextResponse> {
  const verification = await verifyNowPaymentsIpnHttpRequest(req);
  if (!verification.ok) {
    return NextResponse.json({ ok: false, error: verification.error }, { status: verification.status });
  }

  try {
    const db = await createServerClient();
    if (!db) return NextResponse.json({ ok: false, error: 'Billing store unavailable' }, { status: 503 });
    const canonicalPayload = canonicalizeNowPaymentsJson(verification.payload as unknown as Record<string, unknown>);
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalPayload));
    const payloadHash = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
    const result = await processVerifiedNowPaymentsEvent(db, verification.payload, payloadHash);
    if (!result.accepted) {
      return NextResponse.json({ ok: false, error: 'Payment order not found or callback binding mismatch' }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      idempotentReplay: result.replay,
      paymentStatus: result.status,
      activated: result.activated,
    });
  } catch (error) {
    const status = error instanceof WorkspaceContextError ? error.status : 503;
    return NextResponse.json({ ok: false, error: status === 503 ? 'Billing store unavailable' : 'Callback processing failed' }, { status });
  }
}
