import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createPendingPaymentOrder } from '@/ee/billing/nowpayments-order-store';
import { requireWorkspaceOwner, resolveWorkspaceTierContext, workspaceContextErrorResponse } from '@/ee/tenancy/workspace-request-context';

const OrderSchema = z.object({
  workspaceId: z.string().min(1).max(128).optional(),
  targetTier: z.enum(['PREMIUM', 'ENTERPRISE', 'MASTER']),
}).strict();

export async function POST(req: Request) {
  try {
    let body: unknown;
    try { body = await req.json(); } catch {
      return NextResponse.json({ ok: false, error: 'Invalid billing order request' }, { status: 400 });
    }
    const parsed = OrderSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ ok: false, error: 'Invalid billing order request' }, { status: 400 });
    const context = await resolveWorkspaceTierContext(req, { explicitWorkspaceId: parsed.data.workspaceId });
    requireWorkspaceOwner(context);
    const order = await createPendingPaymentOrder(context.db, {
      workspaceId: context.workspaceId,
      ownerUserId: context.userId,
      targetTier: parsed.data.targetTier,
    });
    return NextResponse.json({ ok: true, order }, { status: 201 });
  } catch (error) {
    return workspaceContextErrorResponse(error);
  }
}
