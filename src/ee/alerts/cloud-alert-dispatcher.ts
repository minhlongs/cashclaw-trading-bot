// Step 15: Multi-Channel Cloud Alert Dispatcher (Telegram, Webhook, Email)
// Provides WebCrypto HMAC-SHA256 webhook signing and duplicate suppression
// for 24/7 Cloud SaaS paper-bot notifications.

export type AlertChannel = 'TELEGRAM' | 'WEBHOOK' | 'EMAIL';

export interface CloudAlertEvent {
  readonly eventId: string;
  readonly workspaceId: string;
  readonly botId: string;
  readonly channel: AlertChannel;
  readonly message: string;
  readonly timestampMs: number;
}

export interface SignedWebhookEnvelope {
  readonly eventId: string;
  readonly signatureHex: string;
  readonly payloadJson: string;
}

export async function signAlertWebhookPayload(
  payloadJson: string,
  secret: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadJson));
  return Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export class CloudAlertDeduplicator {
  private readonly seenAtMs = new Map<string, number>();

  public shouldDispatch(event: CloudAlertEvent, cooldownMs = 60_000): boolean {
    const key = `${event.workspaceId}:${event.botId}:${event.channel}:${event.message}`;
    const prev = this.seenAtMs.get(key);
    if (prev !== undefined && event.timestampMs - prev < cooldownMs) {
      return false;
    }
    this.seenAtMs.set(key, event.timestampMs);
    return true;
  }
}
