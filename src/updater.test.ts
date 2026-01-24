import { describe, it, expect } from 'vitest';
import { verifySignature } from './updater.js';

describe('verifySignature', () => {
  const secret = 'test-secret';
  const payload = '{"action":"published"}';

  it('returns true for valid signature', () => {
    // SHA256 HMAC of payload with secret
    const validSig = 'sha256=0d408f71f2420c71a03fe2dd4aa32e00a84408ab43f239d7a41b4ab658e1b064';
    expect(verifySignature(payload, validSig, secret)).toBe(true);
  });

  it('returns false for invalid signature', () => {
    expect(verifySignature(payload, 'sha256=invalid', secret)).toBe(false);
  });

  it('returns false for missing signature', () => {
    expect(verifySignature(payload, '', secret)).toBe(false);
  });
});
