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
  // GitHub sends 'published' for new releases and 'released' when made available
  const validActions = ['published', 'released'];
  if (!validActions.includes(payload.action) || !payload.release?.tag_name) {
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
    // Use sudo for global npm update (required when npm was installed with sudo)
    const npmProcess = spawn('sudo', ['npm', 'update', '-g', '@lvnt/release-radar'], {
      stdio: 'inherit'
    });

    npmProcess.on('error', (err) => {
      resolve({ success: false, error: `npm process error: ${err.message}` });
    });

    npmProcess.on('close', (code) => {
      if (code !== 0) {
        resolve({ success: false, error: `npm update failed with code ${code}` });
        return;
      }

      const pm2Process = spawn('pm2', ['restart', 'release-radar'], {
        stdio: 'inherit'
      });

      pm2Process.on('error', (err) => {
        resolve({ success: false, error: `pm2 process error: ${err.message}` });
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

// Lock to prevent concurrent updates
let updateInProgress = false;
let lastUpdateVersion: string | null = null;
let lastUpdateTime = 0;
const UPDATE_COOLDOWN_MS = 60000; // 1 minute cooldown between updates

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

    // Check if update is already in progress or recently completed for this version
    const now = Date.now();
    if (updateInProgress) {
      console.log(`Ignoring release event for v${version} - update already in progress`);
      res.writeHead(200);
      res.end('OK (update in progress)');
      return;
    }

    if (lastUpdateVersion === version && (now - lastUpdateTime) < UPDATE_COOLDOWN_MS) {
      console.log(`Ignoring release event for v${version} - recently updated`);
      res.writeHead(200);
      res.end('OK (recently updated)');
      return;
    }

    // Respond immediately, update async
    res.writeHead(200);
    res.end('OK');

    updateInProgress = true;
    console.log(`Received release event for v${version}, updating...`);

    const result = await executeUpdate();
    updateInProgress = false;
    lastUpdateVersion = version;
    lastUpdateTime = Date.now();

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
