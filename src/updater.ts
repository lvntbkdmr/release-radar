import { createHmac, timingSafeEqual } from 'crypto';
import { spawn } from 'child_process';

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

export interface UpdateResult {
  success: boolean;
  error?: string;
}

export function executeUpdate(): Promise<UpdateResult> {
  return new Promise((resolve) => {
    const npmProcess = spawn('npm', ['update', '-g', '@lvnt/release-radar'], {
      stdio: 'inherit'
    });

    npmProcess.on('close', (code) => {
      if (code !== 0) {
        resolve({ success: false, error: `npm update failed with code ${code}` });
        return;
      }

      const pm2Process = spawn('pm2', ['restart', 'release-radar'], {
        stdio: 'inherit'
      });

      pm2Process.on('close', (pm2Code) => {
        if (pm2Code !== 0) {
          resolve({ success: false, error: `pm2 restart failed with code ${pm2Code}` });
        } else {
          resolve({ success: true });
        }
      });
    });
  });
}
