import { describe, it, expect } from 'vitest';
import {
  hashPasscode,
  verifyPasscode,
  generateSessionId,
  parseSessionCookie,
} from './session-utils';

describe('hashPasscode', () => {
  it('returns a hash in "hex:salt" format', async () => {
    const result = await hashPasscode('user@test.com', '1234');
    const [hex, salt] = result.split(':');
    expect(hex).toMatch(/^[a-f0-9]{64}$/);
    expect(salt).toBe('user@test.com');
  });

  it('normalizes email to lowercase and trimmed', async () => {
    const a = await hashPasscode('User@Test.COM', '1234');
    const b = await hashPasscode('user@test.com', '1234');
    expect(a).toBe(b);
  });

  it('produces different hashes for different passcodes', async () => {
    const a = await hashPasscode('user@test.com', '1234');
    const b = await hashPasscode('user@test.com', '5678');
    expect(a).not.toBe(b);
  });

  it('produces different hashes for different emails', async () => {
    const a = await hashPasscode('a@test.com', '1234');
    const b = await hashPasscode('b@test.com', '1234');
    expect(a).not.toBe(b);
  });
});

describe('verifyPasscode', () => {
  it('returns true for correct passcode', async () => {
    const hash = await hashPasscode('user@test.com', '1234');
    expect(await verifyPasscode('user@test.com', '1234', hash)).toBe(true);
  });

  it('returns false for wrong passcode', async () => {
    const hash = await hashPasscode('user@test.com', '1234');
    expect(await verifyPasscode('user@test.com', '5678', hash)).toBe(false);
  });

  it('returns false for wrong email', async () => {
    const hash = await hashPasscode('user@test.com', '1234');
    expect(await verifyPasscode('other@test.com', '1234', hash)).toBe(false);
  });

  it('returns false for different length stored hash', async () => {
    expect(await verifyPasscode('user@test.com', '1234', 'short')).toBe(false);
  });
});

describe('generateSessionId', () => {
  it('returns a string starting with sess_', () => {
    const id = generateSessionId();
    expect(id).toMatch(/^sess_/);
  });

  it('generates unique IDs', () => {
    const a = generateSessionId();
    const b = generateSessionId();
    expect(a).not.toBe(b);
  });
});

describe('parseSessionCookie', () => {
  it('extracts session_id from cookie header', () => {
    const req = new Request('http://localhost', {
      headers: { cookie: 'session_id=abc123' },
    });
    expect(parseSessionCookie(req)).toBe('abc123');
  });

  it('extracts session_id from multiple cookies', () => {
    const req = new Request('http://localhost', {
      headers: { cookie: 'theme=dark; session_id=xyz789; lang=vi' },
    });
    expect(parseSessionCookie(req)).toBe('xyz789');
  });

  it('returns null when no cookie header', () => {
    const req = new Request('http://localhost');
    expect(parseSessionCookie(req)).toBeNull();
  });

  it('returns null when session_id not present', () => {
    const req = new Request('http://localhost', {
      headers: { cookie: 'theme=dark' },
    });
    expect(parseSessionCookie(req)).toBeNull();
  });

  it('handles cookies without spaces', () => {
    const req = new Request('http://localhost', {
      headers: { cookie: 'theme=dark;session_id=nospace' },
    });
    expect(parseSessionCookie(req)).toBe('nospace');
  });
});
