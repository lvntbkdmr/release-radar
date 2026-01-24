# Auto-Updater Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a webhook receiver that auto-updates ReleaseRadar when a new version is published on GitHub.

**Architecture:** A standalone HTTP server (`src/updater.ts`) listens on port 9000, verifies GitHub webhook signatures, and triggers `npm update -g` + `pm2 restart` when a release is published. Sends Telegram notification on success/failure.

**Tech Stack:** Node.js built-in `http` and `crypto` modules, existing Telegram bot setup.

---

### Task 1: Signature Verification

**Files:**
- Create: `src/updater.ts`
- Create: `src/updater.test.ts`

**Step 1: Write the failing test for signature verification**

Create `src/updater.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { verifySignature } from './updater.js';

describe('verifySignature', () => {
  const secret = 'test-secret';
  const payload = '{"action":"published"}';

  it('returns true for valid signature', () => {
    // SHA256 HMAC of payload with secret
    const validSig = 'sha256=7d38cdd689735b008b3c702edd92eea23791c5f6';
    expect(verifySignature(payload, validSig, secret)).toBe(true);
  });

  it('returns false for invalid signature', () => {
    expect(verifySignature(payload, 'sha256=invalid', secret)).toBe(false);
  });

  it('returns false for missing signature', () => {
    expect(verifySignature(payload, '', secret)).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/updater.test.ts`
Expected: FAIL with "verifySignature is not exported"

**Step 3: Write minimal implementation**

Create `src/updater.ts`:

```typescript
import { createHmac, timingSafeEqual } from 'crypto';

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
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/updater.test.ts`
Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add src/updater.ts src/updater.test.ts
git commit -m "feat(updater): add webhook signature verification"
```

---

### Task 2: Event Parsing

**Files:**
- Modify: `src/updater.ts`
- Modify: `src/updater.test.ts`

**Step 1: Write the failing test for event parsing**

Add to `src/updater.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { verifySignature, parseReleaseEvent } from './updater.js';

// ... existing tests ...

describe('parseReleaseEvent', () => {
  it('returns version for release.published event', () => {
    const payload = {
      action: 'published',
      release: {
        tag_name: 'v1.2.0'
      }
    };
    expect(parseReleaseEvent(payload)).toBe('1.2.0');
  });

  it('returns null for non-published action', () => {
    const payload = {
      action: 'created',
      release: {
        tag_name: 'v1.2.0'
      }
    };
    expect(parseReleaseEvent(payload)).toBeNull();
  });

  it('returns null for missing release', () => {
    const payload = { action: 'published' };
    expect(parseReleaseEvent(payload)).toBeNull();
  });

  it('strips v prefix from tag', () => {
    const payload = {
      action: 'published',
      release: { tag_name: 'v2.0.0' }
    };
    expect(parseReleaseEvent(payload)).toBe('2.0.0');
  });

  it('handles tag without v prefix', () => {
    const payload = {
      action: 'published',
      release: { tag_name: '2.0.0' }
    };
    expect(parseReleaseEvent(payload)).toBe('2.0.0');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/updater.test.ts`
Expected: FAIL with "parseReleaseEvent is not exported"

**Step 3: Write minimal implementation**

Add to `src/updater.ts`:

```typescript
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
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/updater.test.ts`
Expected: PASS (8 tests)

**Step 5: Commit**

```bash
git add src/updater.ts src/updater.test.ts
git commit -m "feat(updater): add release event parsing"
```

---

### Task 3: Update Executor

**Files:**
- Modify: `src/updater.ts`
- Modify: `src/updater.test.ts`

**Step 1: Write the failing test for executeUpdate**

Add to `src/updater.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { verifySignature, parseReleaseEvent, executeUpdate } from './updater.js';
import { spawn } from 'child_process';

vi.mock('child_process', () => ({
  spawn: vi.fn()
}));

// ... existing tests ...

describe('executeUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs npm update then pm2 restart on success', async () => {
    const mockSpawn = vi.mocked(spawn);

    // Mock npm update success
    const npmProcess = {
      on: vi.fn((event, cb) => {
        if (event === 'close') cb(0);
        return npmProcess;
      })
    };

    // Mock pm2 restart success
    const pm2Process = {
      on: vi.fn((event, cb) => {
        if (event === 'close') cb(0);
        return pm2Process;
      })
    };

    mockSpawn
      .mockReturnValueOnce(npmProcess as any)
      .mockReturnValueOnce(pm2Process as any);

    const result = await executeUpdate();

    expect(result.success).toBe(true);
    expect(mockSpawn).toHaveBeenCalledWith('npm', ['update', '-g', '@lvnt/release-radar'], expect.any(Object));
    expect(mockSpawn).toHaveBeenCalledWith('pm2', ['restart', 'release-radar'], expect.any(Object));
  });

  it('returns failure if npm update fails', async () => {
    const mockSpawn = vi.mocked(spawn);

    const npmProcess = {
      on: vi.fn((event, cb) => {
        if (event === 'close') cb(1);
        return npmProcess;
      })
    };

    mockSpawn.mockReturnValueOnce(npmProcess as any);

    const result = await executeUpdate();

    expect(result.success).toBe(false);
    expect(result.error).toBe('npm update failed with code 1');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/updater.test.ts`
Expected: FAIL with "executeUpdate is not exported"

**Step 3: Write minimal implementation**

Add to `src/updater.ts`:

```typescript
import { spawn } from 'child_process';

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
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/updater.test.ts`
Expected: PASS (10 tests)

**Step 5: Commit**

```bash
git add src/updater.ts src/updater.test.ts
git commit -m "feat(updater): add update executor with npm and pm2"
```

---

### Task 4: HTTP Server

**Files:**
- Modify: `src/updater.ts`

**Step 1: Add the HTTP server and startUpdater function**

Add to `src/updater.ts`:

```typescript
import { createServer, IncomingMessage, ServerResponse } from 'http';
import TelegramBot from 'node-telegram-bot-api';

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
```

**Step 2: Verify the code compiles**

Run: `npm run build`
Expected: No errors

**Step 3: Commit**

```bash
git add src/updater.ts
git commit -m "feat(updater): add HTTP webhook server"
```

---

### Task 5: CLI Entry Point

**Files:**
- Create: `bin/release-radar-updater.js`
- Modify: `package.json`
- Modify: `.env.example`

**Step 1: Create the CLI entry point**

Create `bin/release-radar-updater.js`:

```javascript
#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { config } from 'dotenv';
import TelegramBot from 'node-telegram-bot-api';
import { startUpdater } from '../dist/updater.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from current working directory
const envPath = join(process.cwd(), '.env');
if (existsSync(envPath)) {
  config({ path: envPath });
}

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;
const PORT = parseInt(process.env.UPDATER_PORT || '9000', 10);

if (!BOT_TOKEN || !CHAT_ID) {
  console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID in .env');
  process.exit(1);
}

if (!WEBHOOK_SECRET) {
  console.error('Missing GITHUB_WEBHOOK_SECRET in .env');
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN);

startUpdater({
  port: PORT,
  webhookSecret: WEBHOOK_SECRET,
  telegramBot: bot,
  chatId: CHAT_ID
});
```

**Step 2: Update package.json bin field**

In `package.json`, update the `bin` field:

```json
{
  "bin": {
    "release-radar": "bin/release-radar.js",
    "release-radar-updater": "bin/release-radar-updater.js"
  }
}
```

**Step 3: Update .env.example**

Add to `.env.example`:

```
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here
GITHUB_WEBHOOK_SECRET=your_webhook_secret_here
UPDATER_PORT=9000
```

**Step 4: Verify the build works**

Run: `npm run build`
Expected: No errors

**Step 5: Commit**

```bash
git add bin/release-radar-updater.js package.json .env.example
git commit -m "feat(updater): add CLI entry point and package config"
```

---

### Task 6: Update Documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/OPERATIONS.md`

**Step 1: Update README.md**

Add new section after "Telegram Commands":

```markdown
## Auto-Updater (Optional)

ReleaseRadar includes an optional auto-updater that receives GitHub webhooks and automatically updates itself when you publish a new version.

### Setup

1. Add to your `.env`:
   ```env
   GITHUB_WEBHOOK_SECRET=your_secret_here
   UPDATER_PORT=9000
   ```

2. Configure GitHub webhook:
   - Go to your repo's Settings → Webhooks → Add webhook
   - Payload URL: `https://your-domain.com/webhook`
   - Content type: `application/json`
   - Secret: same as `GITHUB_WEBHOOK_SECRET`
   - Events: Select "Releases" only

3. Start the updater with pm2:
   ```bash
   pm2 start release-radar-updater --name release-radar-updater
   pm2 save
   ```

When you publish a new release, the updater will automatically run `npm update -g @lvnt/release-radar` and restart the main service.
```

**Step 2: Update docs/OPERATIONS.md**

Add new section:

```markdown
## Auto-Updater Service

### Check Status
```bash
pm2 status release-radar-updater
```

### View Logs
```bash
pm2 logs release-radar-updater --lines 50 --nostream
```

### Start/Stop/Restart
```bash
pm2 start release-radar-updater
pm2 stop release-radar-updater
pm2 restart release-radar-updater
```

### First-Time Setup
```bash
# Ensure GITHUB_WEBHOOK_SECRET is set in .env
pm2 start release-radar-updater --name release-radar-updater
pm2 save
```
```

**Step 3: Commit**

```bash
git add README.md docs/OPERATIONS.md
git commit -m "docs: add auto-updater documentation"
```

---

### Task 7: Version Bump and Final Verification

**Files:**
- Modify: `package.json`

**Step 1: Bump version to 1.1.0**

In `package.json`, change version:

```json
{
  "version": "1.1.0"
}
```

**Step 2: Run all tests**

Run: `npm test`
Expected: All tests pass

**Step 3: Verify build**

Run: `npm run build`
Expected: No errors

**Step 4: Commit**

```bash
git add package.json
git commit -m "chore: bump version to 1.1.0"
```

---

## Summary

| Task | Description |
|------|-------------|
| 1 | Signature verification with HMAC-SHA256 |
| 2 | GitHub release event parsing |
| 3 | Update executor (npm update + pm2 restart) |
| 4 | HTTP webhook server |
| 5 | CLI entry point and package config |
| 6 | Documentation updates |
| 7 | Version bump and final verification |
