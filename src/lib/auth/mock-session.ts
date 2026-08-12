// Mock Auth Session — lightweight for local dev / testing
// Replace with real auth (Kong, Clerk, etc.) for production

export interface User {
  id: string;
  email: string;
  name: string;
  tier: 'BASIC' | 'PREMIUM' | 'ENTERPRISE';
}

// In-memory session for local dev
const sessionStore = new Map<string, { user: User; expires: number }>();

export function createMockUser(overrides?: Partial<User>): User {
  return {
    id: overrides?.id ?? 'user-dev-001',
    email: overrides?.email ?? 'dev@local.test',
    name: overrides?.name ?? 'Dev User',
    tier: overrides?.tier ?? 'BASIC',
  };
}

export function setSession(user: User, ttlMs = 86400000): string {
  const token = `mock-${user.id}-${Date.now()}`;
  sessionStore.set(token, { user, expires: Date.now() + ttlMs });
  return token;
}

export function getSession(token: string): { user: User } | null {
  const entry = sessionStore.get(token);
  if (!entry || Date.now() > entry.expires) {
    sessionStore.delete(token);
    return null;
  }
  return { user: entry.user };
}

export function clearSession(token: string): void {
  sessionStore.delete(token);
}

export function clearAllSessions(): void {
  sessionStore.clear();
}
