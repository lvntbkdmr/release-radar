import { createHmac, timingSafeEqual } from 'crypto';

export interface GitHubReleasePayload {
  action: string;
  release?: {
    tag_name: string;
  };
}

export function parseReleaseEvent(payload: GitHubReleasePayload): string | null {
  if (payload.action !== 'published' || !payload.release?.tag_name) {
    return null;
  }

  const tag = payload.release.tag_name;
  return tag.startsWith('v') ? tag.slice(1) : tag;
}

export function verifySignature(payload: string, signature: string, secret: string): boolean {
  if (!signature || !signature.startsWith('sha256=')) {
    return false;
  }

  const expected = 'sha256=' + createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}
