import { createHmac, timingSafeEqual } from 'crypto';
import { spawn } from 'child_process';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import TelegramBot from 'node-telegram-bot-api';

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

export interface UpdaterConfig {
  port: number;
  webhookSecret: string;
  telegramBot: TelegramBot;
  chatId: string;
}

export function startUpdater(config: UpdaterConfig): void {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // Only accept POST /webhook
    if (req.method !== 'POST' || req.url !== '/webhook') {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    // Read body
    let body = '';
    for await (const chunk of req) {
      body += chunk;
    }

    // Verify signature
    const signature = req.headers['x-hub-signature-256'] as string;
    if (!verifySignature(body, signature, config.webhookSecret)) {
      res.writeHead(401);
      res.end('Invalid signature');
      return;
    }

    // Parse event
    let payload: GitHubReleasePayload;
    try {
      payload = JSON.parse(body);
    } catch {
      res.writeHead(400);
      res.end('Invalid JSON');
      return;
    }

    const version = parseReleaseEvent(payload);
    if (!version) {
      // Not a release.published event, acknowledge but don't update
      res.writeHead(200);
      res.end('OK (ignored)');
      return;
    }

    // Respond immediately, update async
    res.writeHead(200);
    res.end('OK');

    console.log(`Received release event for v${version}, updating...`);

    const result = await executeUpdate();

    if (result.success) {
      await config.telegramBot.sendMessage(
        config.chatId,
        `🔄 Updated release-radar to v${version}`
      );
    } else {
      await config.telegramBot.sendMessage(
        config.chatId,
        `⚠️ Failed to update release-radar: ${result.error}`
      );
    }
  });

  server.listen(config.port, () => {
    console.log(`Updater webhook server listening on port ${config.port}`);
  });
}
