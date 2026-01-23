# ReleaseRadar Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Node.js service that monitors tool versions and sends Telegram notifications when updates are detected.

**Architecture:** Fetcher-based plugin system where each source type (GitHub, npm, VS Code Marketplace, custom) has its own fetcher. A scheduler triggers periodic checks, comparing fetched versions against stored JSON state, and notifies via Telegram bot on changes or failures.

**Tech Stack:** Node.js, TypeScript, node-telegram-bot-api, node-cron, vitest (testing)

---

## Task 1: Project Setup

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `.env.example`

**Step 1: Initialize npm project**

Run: `npm init -y`

**Step 2: Install dependencies**

Run: `npm install node-telegram-bot-api node-cron`
Run: `npm install -D typescript tsx vitest @types/node @types/node-telegram-bot-api @types/node-cron`

**Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 4: Update package.json scripts**

Add to package.json:
```json
{
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

**Step 5: Create .gitignore**

```
node_modules/
dist/
.env
data/versions.json
```

**Step 6: Create .env.example**

```
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here
```

**Step 7: Create directory structure**

Run: `mkdir -p src/fetchers config data`

**Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json .gitignore .env.example
git commit -m "chore: initialize project with TypeScript and dependencies"
```

---

## Task 2: Storage Module

**Files:**
- Create: `src/storage.ts`
- Create: `src/storage.test.ts`

**Step 1: Write the failing test for load (empty state)**

```typescript
// src/storage.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Storage } from './storage.js';
import { writeFileSync, unlinkSync, mkdirSync, rmSync } from 'fs';

describe('Storage', () => {
  const testDir = './test-data';
  const testPath = `${testDir}/versions.json`;
  let storage: Storage;

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    storage = new Storage(testPath);
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('returns empty state when file does not exist', () => {
    const state = storage.load();
    expect(state).toEqual({ lastCheck: null, versions: {} });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/storage.test.ts`
Expected: FAIL with "Cannot find module './storage.js'"

**Step 3: Write minimal implementation for load**

```typescript
// src/storage.ts
import { readFileSync, writeFileSync, renameSync, existsSync } from 'fs';

export interface StorageState {
  lastCheck: string | null;
  versions: Record<string, string>;
}

export class Storage {
  constructor(private filePath: string) {}

  load(): StorageState {
    if (!existsSync(this.filePath)) {
      return { lastCheck: null, versions: {} };
    }
    const content = readFileSync(this.filePath, 'utf-8');
    return JSON.parse(content);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/storage.test.ts`
Expected: PASS

**Step 5: Write test for load with existing file**

Add to `src/storage.test.ts`:
```typescript
  it('loads existing state from file', () => {
    const existingState = {
      lastCheck: '2026-01-23T10:00:00Z',
      versions: { 'VSCode': '1.96.0' }
    };
    writeFileSync(testPath, JSON.stringify(existingState));

    const state = storage.load();
    expect(state).toEqual(existingState);
  });
```

**Step 6: Run test to verify it passes**

Run: `npx vitest run src/storage.test.ts`
Expected: PASS (already implemented)

**Step 7: Write test for save**

Add to `src/storage.test.ts`:
```typescript
  it('saves state to file', () => {
    const state: StorageState = {
      lastCheck: '2026-01-23T10:00:00Z',
      versions: { 'Ninja': '1.12.0' }
    };

    storage.save(state);

    const loaded = storage.load();
    expect(loaded).toEqual(state);
  });
```

Add import at top:
```typescript
import { Storage, StorageState } from './storage.js';
```

**Step 8: Run test to verify it fails**

Run: `npx vitest run src/storage.test.ts`
Expected: FAIL with "storage.save is not a function"

**Step 9: Implement save with atomic write**

Add to `src/storage.ts` in Storage class:
```typescript
  save(state: StorageState): void {
    const tempPath = `${this.filePath}.tmp`;
    writeFileSync(tempPath, JSON.stringify(state, null, 2));
    renameSync(tempPath, this.filePath);
  }
```

**Step 10: Run test to verify it passes**

Run: `npx vitest run src/storage.test.ts`
Expected: PASS

**Step 11: Write test for getVersion and setVersion helpers**

Add to `src/storage.test.ts`:
```typescript
  it('getVersion returns null for unknown tool', () => {
    expect(storage.getVersion('Unknown')).toBeNull();
  });

  it('getVersion returns stored version', () => {
    const state = { lastCheck: null, versions: { 'Git': '2.44.0' } };
    writeFileSync(testPath, JSON.stringify(state));
    storage = new Storage(testPath); // reload

    expect(storage.getVersion('Git')).toBe('2.44.0');
  });

  it('setVersion updates and persists', () => {
    storage.setVersion('Ninja', '1.12.0');

    // Reload and verify
    const newStorage = new Storage(testPath);
    expect(newStorage.getVersion('Ninja')).toBe('1.12.0');
  });
```

**Step 12: Run test to verify it fails**

Run: `npx vitest run src/storage.test.ts`
Expected: FAIL with "storage.getVersion is not a function"

**Step 13: Implement getVersion and setVersion**

Add to `src/storage.ts` in Storage class:
```typescript
  private state: StorageState | null = null;

  private ensureLoaded(): StorageState {
    if (!this.state) {
      this.state = this.load();
    }
    return this.state;
  }

  getVersion(toolName: string): string | null {
    const state = this.ensureLoaded();
    return state.versions[toolName] ?? null;
  }

  setVersion(toolName: string, version: string): void {
    const state = this.ensureLoaded();
    state.versions[toolName] = version;
    state.lastCheck = new Date().toISOString();
    this.save(state);
  }
```

**Step 14: Run all storage tests**

Run: `npx vitest run src/storage.test.ts`
Expected: All PASS

**Step 15: Commit**

```bash
git add src/storage.ts src/storage.test.ts
git commit -m "feat: add storage module with atomic JSON persistence"
```

---

## Task 3: GitHub Release Fetcher

**Files:**
- Create: `src/fetchers/github-release.ts`
- Create: `src/fetchers/github-release.test.ts`

**Step 1: Write the failing test**

```typescript
// src/fetchers/github-release.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchGitHubRelease } from './github-release.js';

describe('fetchGitHubRelease', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('extracts version from tag_name', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ tag_name: 'v1.12.0' })
    });

    const version = await fetchGitHubRelease('ninja-build/ninja');

    expect(version).toBe('1.12.0');
    expect(fetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/ninja-build/ninja/releases/latest',
      expect.any(Object)
    );
  });

  it('handles tag without v prefix', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ tag_name: '2.44.0' })
    });

    const version = await fetchGitHubRelease('git-for-windows/git');
    expect(version).toBe('2.44.0');
  });

  it('throws on API error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found'
    });

    await expect(fetchGitHubRelease('invalid/repo'))
      .rejects.toThrow('GitHub API error: 404 Not Found');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/fetchers/github-release.test.ts`
Expected: FAIL with "Cannot find module './github-release.js'"

**Step 3: Implement the fetcher**

```typescript
// src/fetchers/github-release.ts
export async function fetchGitHubRelease(repo: string): Promise<string> {
  const url = `https://api.github.com/repos/${repo}/releases/latest`;

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'ReleaseRadar/1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as { tag_name: string };
  const version = data.tag_name.replace(/^v/, '');

  return version;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/fetchers/github-release.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/fetchers/github-release.ts src/fetchers/github-release.test.ts
git commit -m "feat: add GitHub release fetcher"
```

---

## Task 4: npm Fetcher

**Files:**
- Create: `src/fetchers/npm.ts`
- Create: `src/fetchers/npm.test.ts`

**Step 1: Write the failing test**

```typescript
// src/fetchers/npm.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchNpmVersion } from './npm.js';

describe('fetchNpmVersion', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('extracts version from npm registry', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '2.1.0' })
    });

    const version = await fetchNpmVersion('ralphy-cli');

    expect(version).toBe('2.1.0');
    expect(fetch).toHaveBeenCalledWith(
      'https://registry.npmjs.org/ralphy-cli/latest'
    );
  });

  it('throws on registry error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found'
    });

    await expect(fetchNpmVersion('nonexistent-package'))
      .rejects.toThrow('npm registry error: 404 Not Found');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/fetchers/npm.test.ts`
Expected: FAIL with "Cannot find module './npm.js'"

**Step 3: Implement the fetcher**

```typescript
// src/fetchers/npm.ts
export async function fetchNpmVersion(packageName: string): Promise<string> {
  const url = `https://registry.npmjs.org/${packageName}/latest`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`npm registry error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as { version: string };
  return data.version;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/fetchers/npm.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/fetchers/npm.ts src/fetchers/npm.test.ts
git commit -m "feat: add npm registry fetcher"
```

---

## Task 5: VS Code Marketplace Fetcher

**Files:**
- Create: `src/fetchers/vscode-marketplace.ts`
- Create: `src/fetchers/vscode-marketplace.test.ts`

**Step 1: Write the failing test**

```typescript
// src/fetchers/vscode-marketplace.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchVSCodeMarketplace } from './vscode-marketplace.js';

describe('fetchVSCodeMarketplace', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('extracts version from marketplace API', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        results: [{
          extensions: [{
            versions: [{ version: '1.2.3' }]
          }]
        }]
      })
    });

    const version = await fetchVSCodeMarketplace('anthropic.claude-code');

    expect(version).toBe('1.2.3');
  });

  it('throws on API error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error'
    });

    await expect(fetchVSCodeMarketplace('some.extension'))
      .rejects.toThrow('VS Code Marketplace error: 500 Internal Server Error');
  });

  it('throws when extension not found', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results: [{ extensions: [] }] })
    });

    await expect(fetchVSCodeMarketplace('nonexistent.extension'))
      .rejects.toThrow('Extension not found: nonexistent.extension');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/fetchers/vscode-marketplace.test.ts`
Expected: FAIL with "Cannot find module './vscode-marketplace.js'"

**Step 3: Implement the fetcher**

```typescript
// src/fetchers/vscode-marketplace.ts
interface MarketplaceResponse {
  results: Array<{
    extensions: Array<{
      versions: Array<{ version: string }>;
    }>;
  }>;
}

export async function fetchVSCodeMarketplace(extensionId: string): Promise<string> {
  const url = 'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json;api-version=7.1-preview.1'
    },
    body: JSON.stringify({
      filters: [{
        criteria: [{ filterType: 7, value: extensionId }]
      }],
      flags: 0x200 // Include versions
    })
  });

  if (!response.ok) {
    throw new Error(`VS Code Marketplace error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as MarketplaceResponse;
  const extension = data.results[0]?.extensions[0];

  if (!extension) {
    throw new Error(`Extension not found: ${extensionId}`);
  }

  return extension.versions[0].version;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/fetchers/vscode-marketplace.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/fetchers/vscode-marketplace.ts src/fetchers/vscode-marketplace.test.ts
git commit -m "feat: add VS Code Marketplace fetcher"
```

---

## Task 6: Custom Fetchers (VSCode, Claude Code CLI, CMake)

**Files:**
- Create: `src/fetchers/custom.ts`
- Create: `src/fetchers/custom.test.ts`

**Step 1: Write the failing test for VSCode**

```typescript
// src/fetchers/custom.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchVSCodeVersion, fetchClaudeCodeCLI, fetchCMakeVersion } from './custom.js';

describe('custom fetchers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchVSCodeVersion', () => {
    it('extracts first version from releases array', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(['1.96.0', '1.95.3', '1.95.2'])
      });

      const version = await fetchVSCodeVersion();

      expect(version).toBe('1.96.0');
      expect(fetch).toHaveBeenCalledWith(
        'https://update.code.visualstudio.com/api/releases/stable'
      );
    });
  });

  describe('fetchClaudeCodeCLI', () => {
    it('extracts version from text response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('1.0.5')
      });

      const version = await fetchClaudeCodeCLI();
      expect(version).toBe('1.0.5');
    });

    it('falls back to GitHub on primary failure', async () => {
      global.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: false, status: 503 })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ tag_name: 'v1.0.6' })
        });

      const version = await fetchClaudeCodeCLI();
      expect(version).toBe('1.0.6');
    });
  });

  describe('fetchCMakeVersion', () => {
    it('parses version from HTML directory listing', async () => {
      const html = `
        <a href="cmake-3.28.0-linux-x86_64.tar.gz">cmake-3.28.0-linux-x86_64.tar.gz</a>
        <a href="cmake-3.28.0-windows-x86_64.msi">cmake-3.28.0-windows-x86_64.msi</a>
      `;
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(html)
      });

      const version = await fetchCMakeVersion();
      expect(version).toBe('3.28.0');
    });

    it('throws when no version found in listing', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('<html>empty</html>')
      });

      await expect(fetchCMakeVersion())
        .rejects.toThrow('Could not parse CMake version from directory listing');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/fetchers/custom.test.ts`
Expected: FAIL with "Cannot find module './custom.js'"

**Step 3: Implement the custom fetchers**

```typescript
// src/fetchers/custom.ts

export async function fetchVSCodeVersion(): Promise<string> {
  const response = await fetch('https://update.code.visualstudio.com/api/releases/stable');

  if (!response.ok) {
    throw new Error(`VSCode API error: ${response.status} ${response.statusText}`);
  }

  const releases = await response.json() as string[];
  return releases[0];
}

export async function fetchClaudeCodeCLI(): Promise<string> {
  const primaryUrl = 'https://storage.googleapis.com/claude-code-dist-86c565f3-f756-42ad-8dfa-d59b1c096819/claude-code-releases/latest';
  const fallbackUrl = 'https://api.github.com/repos/anthropics/claude-code/releases/latest';

  try {
    const response = await fetch(primaryUrl);
    if (response.ok) {
      const version = await response.text();
      return version.trim();
    }
  } catch {
    // Fall through to fallback
  }

  const response = await fetch(fallbackUrl, {
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'ReleaseRadar/1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`Claude Code CLI fetch failed: ${response.status}`);
  }

  const data = await response.json() as { tag_name: string };
  return data.tag_name.replace(/^v/, '');
}

export async function fetchCMakeVersion(): Promise<string> {
  const response = await fetch('https://cmake.org/files/LatestRelease/');

  if (!response.ok) {
    throw new Error(`CMake fetch error: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const match = html.match(/cmake-(\d+\.\d+\.\d+)/);

  if (!match) {
    throw new Error('Could not parse CMake version from directory listing');
  }

  return match[1];
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/fetchers/custom.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/fetchers/custom.ts src/fetchers/custom.test.ts
git commit -m "feat: add custom fetchers for VSCode, Claude Code CLI, CMake"
```

---

## Task 7: Fetcher Registry

**Files:**
- Create: `src/fetchers/index.ts`
- Create: `src/fetchers/index.test.ts`
- Create: `src/types.ts`

**Step 1: Create types file**

```typescript
// src/types.ts
export interface ToolConfig {
  name: string;
  type: 'github' | 'npm' | 'vscode-marketplace' | 'custom';
  repo?: string;           // for github type
  package?: string;        // for npm type
  extensionId?: string;    // for vscode-marketplace type
  url?: string;            // for custom type
  fallbackUrl?: string;    // optional fallback
  customFetcher?: string;  // which custom fetcher to use: 'vscode' | 'claude-cli' | 'cmake'
}

export interface Config {
  checkIntervalHours: number;
  tools: ToolConfig[];
}
```

**Step 2: Write the failing test**

```typescript
// src/fetchers/index.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchVersion } from './index.js';
import type { ToolConfig } from '../types.js';

vi.mock('./github-release.js', () => ({
  fetchGitHubRelease: vi.fn().mockResolvedValue('1.12.0')
}));

vi.mock('./npm.js', () => ({
  fetchNpmVersion: vi.fn().mockResolvedValue('2.1.0')
}));

vi.mock('./vscode-marketplace.js', () => ({
  fetchVSCodeMarketplace: vi.fn().mockResolvedValue('1.2.3')
}));

vi.mock('./custom.js', () => ({
  fetchVSCodeVersion: vi.fn().mockResolvedValue('1.96.0'),
  fetchClaudeCodeCLI: vi.fn().mockResolvedValue('1.0.5'),
  fetchCMakeVersion: vi.fn().mockResolvedValue('3.28.0')
}));

describe('fetchVersion', () => {
  it('routes github type to GitHub fetcher', async () => {
    const tool: ToolConfig = { name: 'Ninja', type: 'github', repo: 'ninja-build/ninja' };
    const version = await fetchVersion(tool);
    expect(version).toBe('1.12.0');
  });

  it('routes npm type to npm fetcher', async () => {
    const tool: ToolConfig = { name: 'Ralphy', type: 'npm', package: 'ralphy-cli' };
    const version = await fetchVersion(tool);
    expect(version).toBe('2.1.0');
  });

  it('routes vscode-marketplace type', async () => {
    const tool: ToolConfig = { name: 'Claude Code', type: 'vscode-marketplace', extensionId: 'anthropic.claude-code' };
    const version = await fetchVersion(tool);
    expect(version).toBe('1.2.3');
  });

  it('routes custom type with customFetcher', async () => {
    const tool: ToolConfig = { name: 'VSCode', type: 'custom', customFetcher: 'vscode' };
    const version = await fetchVersion(tool);
    expect(version).toBe('1.96.0');
  });

  it('throws for unknown type', async () => {
    const tool = { name: 'Unknown', type: 'invalid' } as unknown as ToolConfig;
    await expect(fetchVersion(tool)).rejects.toThrow('Unknown tool type: invalid');
  });
});
```

**Step 3: Run test to verify it fails**

Run: `npx vitest run src/fetchers/index.test.ts`
Expected: FAIL with "Cannot find module './index.js'"

**Step 4: Implement the registry**

```typescript
// src/fetchers/index.ts
import type { ToolConfig } from '../types.js';
import { fetchGitHubRelease } from './github-release.js';
import { fetchNpmVersion } from './npm.js';
import { fetchVSCodeMarketplace } from './vscode-marketplace.js';
import { fetchVSCodeVersion, fetchClaudeCodeCLI, fetchCMakeVersion } from './custom.js';

export async function fetchVersion(tool: ToolConfig): Promise<string> {
  switch (tool.type) {
    case 'github':
      if (!tool.repo) throw new Error(`Missing repo for ${tool.name}`);
      return fetchGitHubRelease(tool.repo);

    case 'npm':
      if (!tool.package) throw new Error(`Missing package for ${tool.name}`);
      return fetchNpmVersion(tool.package);

    case 'vscode-marketplace':
      if (!tool.extensionId) throw new Error(`Missing extensionId for ${tool.name}`);
      return fetchVSCodeMarketplace(tool.extensionId);

    case 'custom':
      return fetchCustom(tool);

    default:
      throw new Error(`Unknown tool type: ${(tool as ToolConfig).type}`);
  }
}

async function fetchCustom(tool: ToolConfig): Promise<string> {
  switch (tool.customFetcher) {
    case 'vscode':
      return fetchVSCodeVersion();
    case 'claude-cli':
      return fetchClaudeCodeCLI();
    case 'cmake':
      return fetchCMakeVersion();
    default:
      throw new Error(`Unknown custom fetcher: ${tool.customFetcher}`);
  }
}
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run src/fetchers/index.test.ts`
Expected: All PASS

**Step 6: Commit**

```bash
git add src/types.ts src/fetchers/index.ts src/fetchers/index.test.ts
git commit -m "feat: add fetcher registry with type routing"
```

---

## Task 8: Notifier Module (Telegram)

**Files:**
- Create: `src/notifier.ts`
- Create: `src/notifier.test.ts`

**Step 1: Write the failing test**

```typescript
// src/notifier.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Notifier } from './notifier.js';

describe('Notifier', () => {
  let mockBot: { sendMessage: ReturnType<typeof vi.fn> };
  let notifier: Notifier;

  beforeEach(() => {
    mockBot = { sendMessage: vi.fn().mockResolvedValue({}) };
    notifier = new Notifier(mockBot as any, '123456789');
  });

  it('sends update notification with correct format', async () => {
    await notifier.sendUpdate('Ninja', '1.11.1', '1.12.0');

    expect(mockBot.sendMessage).toHaveBeenCalledWith(
      '123456789',
      '🔄 Ninja: 1.11.1 → 1.12.0'
    );
  });

  it('sends batched updates as single message', async () => {
    const updates = [
      { name: 'Ninja', oldVersion: '1.11.1', newVersion: '1.12.0' },
      { name: 'Git', oldVersion: '2.43.0', newVersion: '2.44.0' }
    ];

    await notifier.sendBatchedUpdates(updates);

    expect(mockBot.sendMessage).toHaveBeenCalledTimes(1);
    expect(mockBot.sendMessage).toHaveBeenCalledWith(
      '123456789',
      '🔄 Ninja: 1.11.1 → 1.12.0\n🔄 Git: 2.43.0 → 2.44.0'
    );
  });

  it('sends failure notification', async () => {
    await notifier.sendFailure('CMake', 'Request timeout');

    expect(mockBot.sendMessage).toHaveBeenCalledWith(
      '123456789',
      '⚠️ Failed to check CMake: Request timeout'
    );
  });

  it('sends batched failures as single message', async () => {
    const failures = [
      { name: 'CMake', error: 'Timeout' },
      { name: 'VSCode', error: 'Connection refused' }
    ];

    await notifier.sendBatchedFailures(failures);

    expect(mockBot.sendMessage).toHaveBeenCalledTimes(1);
    expect(mockBot.sendMessage).toHaveBeenCalledWith(
      '123456789',
      '⚠️ Failed to check CMake: Timeout\n⚠️ Failed to check VSCode: Connection refused'
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/notifier.test.ts`
Expected: FAIL with "Cannot find module './notifier.js'"

**Step 3: Implement the notifier**

```typescript
// src/notifier.ts
import TelegramBot from 'node-telegram-bot-api';

export interface UpdateInfo {
  name: string;
  oldVersion: string;
  newVersion: string;
}

export interface FailureInfo {
  name: string;
  error: string;
}

export class Notifier {
  constructor(
    private bot: TelegramBot,
    private chatId: string
  ) {}

  async sendUpdate(name: string, oldVersion: string, newVersion: string): Promise<void> {
    await this.bot.sendMessage(this.chatId, `🔄 ${name}: ${oldVersion} → ${newVersion}`);
  }

  async sendBatchedUpdates(updates: UpdateInfo[]): Promise<void> {
    if (updates.length === 0) return;

    const message = updates
      .map(u => `🔄 ${u.name}: ${u.oldVersion} → ${u.newVersion}`)
      .join('\n');

    await this.bot.sendMessage(this.chatId, message);
  }

  async sendFailure(name: string, error: string): Promise<void> {
    await this.bot.sendMessage(this.chatId, `⚠️ Failed to check ${name}: ${error}`);
  }

  async sendBatchedFailures(failures: FailureInfo[]): Promise<void> {
    if (failures.length === 0) return;

    const message = failures
      .map(f => `⚠️ Failed to check ${f.name}: ${f.error}`)
      .join('\n');

    await this.bot.sendMessage(this.chatId, message);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/notifier.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/notifier.ts src/notifier.test.ts
git commit -m "feat: add Telegram notifier with batched message support"
```

---

## Task 9: Checker Module

**Files:**
- Create: `src/checker.ts`
- Create: `src/checker.test.ts`

**Step 1: Write the failing test**

```typescript
// src/checker.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Checker } from './checker.js';
import type { ToolConfig } from './types.js';

vi.mock('./fetchers/index.js', () => ({
  fetchVersion: vi.fn()
}));

import { fetchVersion } from './fetchers/index.js';

describe('Checker', () => {
  let mockStorage: {
    getVersion: ReturnType<typeof vi.fn>;
    setVersion: ReturnType<typeof vi.fn>;
  };
  let mockNotifier: {
    sendBatchedUpdates: ReturnType<typeof vi.fn>;
    sendBatchedFailures: ReturnType<typeof vi.fn>;
  };
  let checker: Checker;
  let tools: ToolConfig[];

  beforeEach(() => {
    vi.clearAllMocks();

    mockStorage = {
      getVersion: vi.fn(),
      setVersion: vi.fn()
    };

    mockNotifier = {
      sendBatchedUpdates: vi.fn().mockResolvedValue(undefined),
      sendBatchedFailures: vi.fn().mockResolvedValue(undefined)
    };

    tools = [
      { name: 'Ninja', type: 'github', repo: 'ninja-build/ninja' },
      { name: 'Git', type: 'github', repo: 'git-for-windows/git' }
    ];

    checker = new Checker(tools, mockStorage as any, mockNotifier as any);
  });

  it('notifies on version change', async () => {
    mockStorage.getVersion.mockReturnValueOnce('1.11.1').mockReturnValueOnce('2.43.0');
    vi.mocked(fetchVersion)
      .mockResolvedValueOnce('1.12.0')
      .mockResolvedValueOnce('2.43.0');

    await checker.checkAll();

    expect(mockNotifier.sendBatchedUpdates).toHaveBeenCalledWith([
      { name: 'Ninja', oldVersion: '1.11.1', newVersion: '1.12.0' }
    ]);
    expect(mockStorage.setVersion).toHaveBeenCalledWith('Ninja', '1.12.0');
  });

  it('skips notification on first run (no stored version)', async () => {
    mockStorage.getVersion.mockReturnValue(null);
    vi.mocked(fetchVersion).mockResolvedValue('1.12.0');

    await checker.checkAll();

    expect(mockNotifier.sendBatchedUpdates).toHaveBeenCalledWith([]);
    expect(mockStorage.setVersion).toHaveBeenCalledTimes(2);
  });

  it('notifies on fetch failure', async () => {
    mockStorage.getVersion.mockReturnValue('1.11.1');
    vi.mocked(fetchVersion)
      .mockRejectedValueOnce(new Error('Timeout'))
      .mockResolvedValueOnce('2.43.0');

    await checker.checkAll();

    expect(mockNotifier.sendBatchedFailures).toHaveBeenCalledWith([
      { name: 'Ninja', error: 'Timeout' }
    ]);
  });

  it('does not notify when version unchanged', async () => {
    mockStorage.getVersion.mockReturnValue('1.12.0');
    vi.mocked(fetchVersion).mockResolvedValue('1.12.0');

    await checker.checkAll();

    expect(mockNotifier.sendBatchedUpdates).toHaveBeenCalledWith([]);
    expect(mockStorage.setVersion).not.toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/checker.test.ts`
Expected: FAIL with "Cannot find module './checker.js'"

**Step 3: Implement the checker**

```typescript
// src/checker.ts
import type { ToolConfig } from './types.js';
import type { Storage } from './storage.js';
import type { Notifier, UpdateInfo, FailureInfo } from './notifier.js';
import { fetchVersion } from './fetchers/index.js';

export class Checker {
  constructor(
    private tools: ToolConfig[],
    private storage: Storage,
    private notifier: Notifier
  ) {}

  async checkAll(): Promise<void> {
    const updates: UpdateInfo[] = [];
    const failures: FailureInfo[] = [];

    for (const tool of this.tools) {
      try {
        const newVersion = await fetchVersion(tool);
        const oldVersion = this.storage.getVersion(tool.name);

        if (oldVersion === null) {
          // First run - store without notifying
          this.storage.setVersion(tool.name, newVersion);
        } else if (oldVersion !== newVersion) {
          updates.push({ name: tool.name, oldVersion, newVersion });
          this.storage.setVersion(tool.name, newVersion);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push({ name: tool.name, error: message });
      }
    }

    await this.notifier.sendBatchedUpdates(updates);
    await this.notifier.sendBatchedFailures(failures);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/checker.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/checker.ts src/checker.test.ts
git commit -m "feat: add checker module with update detection"
```

---

## Task 10: Main Entry Point

**Files:**
- Create: `src/index.ts`
- Create: `config/tools.json`

**Step 1: Create the tools configuration file**

```json
{
  "checkIntervalHours": 6,
  "tools": [
    {
      "name": "VSCode",
      "type": "custom",
      "customFetcher": "vscode"
    },
    {
      "name": "Claude Code CLI",
      "type": "custom",
      "customFetcher": "claude-cli"
    },
    {
      "name": "Ninja",
      "type": "github",
      "repo": "ninja-build/ninja"
    },
    {
      "name": "CMake",
      "type": "custom",
      "customFetcher": "cmake"
    },
    {
      "name": "Git",
      "type": "github",
      "repo": "git-for-windows/git"
    },
    {
      "name": "Clangd",
      "type": "github",
      "repo": "clangd/clangd"
    },
    {
      "name": "Wezterm",
      "type": "github",
      "repo": "wezterm/wezterm"
    },
    {
      "name": "Ralphy",
      "type": "npm",
      "package": "ralphy-cli"
    },
    {
      "name": "vscode-cpptools",
      "type": "github",
      "repo": "microsoft/vscode-cpptools"
    },
    {
      "name": "vscode-clangd",
      "type": "github",
      "repo": "clangd/vscode-clangd"
    },
    {
      "name": "Claude Code VSCode",
      "type": "vscode-marketplace",
      "extensionId": "anthropic.claude-code"
    },
    {
      "name": "CMake Tools",
      "type": "github",
      "repo": "microsoft/vscode-cmake-tools"
    },
    {
      "name": "Roo Code",
      "type": "github",
      "repo": "RooCodeInc/Roo-Code"
    },
    {
      "name": "Atlascode",
      "type": "github",
      "repo": "atlassian/atlascode"
    },
    {
      "name": "Zed",
      "type": "github",
      "repo": "zed-industries/zed"
    }
  ]
}
```

**Step 2: Create the main entry point**

```typescript
// src/index.ts
import TelegramBot from 'node-telegram-bot-api';
import cron from 'node-cron';
import { readFileSync } from 'fs';
import { Storage } from './storage.js';
import { Notifier } from './notifier.js';
import { Checker } from './checker.js';
import type { Config } from './types.js';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!BOT_TOKEN || !CHAT_ID) {
  console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID environment variables');
  process.exit(1);
}

// Load config
const config: Config = JSON.parse(
  readFileSync('./config/tools.json', 'utf-8')
);

// Initialize components
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const storage = new Storage('./data/versions.json');
const notifier = new Notifier(bot, CHAT_ID);
const checker = new Checker(config.tools, storage, notifier);

// Bot commands
bot.onText(/\/check/, async (msg) => {
  if (msg.chat.id.toString() !== CHAT_ID) return;

  await bot.sendMessage(CHAT_ID, 'Checking for updates...');
  await checker.checkAll();
  await bot.sendMessage(CHAT_ID, 'Check complete.');
});

bot.onText(/\/status/, async (msg) => {
  if (msg.chat.id.toString() !== CHAT_ID) return;

  const state = storage.load();
  const lines = Object.entries(state.versions)
    .map(([name, version]) => `${name}: ${version}`)
    .sort();

  const message = lines.length > 0
    ? lines.join('\n')
    : 'No versions tracked yet. Run /check first.';

  await bot.sendMessage(CHAT_ID, message);
});

// Schedule periodic checks
const cronExpression = `0 */${config.checkIntervalHours} * * *`;
cron.schedule(cronExpression, async () => {
  console.log(`[${new Date().toISOString()}] Running scheduled check`);
  await checker.checkAll();
});

console.log(`ReleaseRadar started. Checking every ${config.checkIntervalHours} hours.`);
console.log(`Tracking ${config.tools.length} tools.`);
```

**Step 3: Run tests to ensure nothing is broken**

Run: `npx vitest run`
Expected: All tests PASS

**Step 4: Build the project**

Run: `npm run build`
Expected: Compiles without errors

**Step 5: Commit**

```bash
git add src/index.ts config/tools.json
git commit -m "feat: add main entry point with bot commands and scheduler"
```

---

## Task 11: Final Verification

**Step 1: Run all tests**

Run: `npm test`
Expected: All tests PASS

**Step 2: Build the project**

Run: `npm run build`
Expected: No errors, dist/ folder created

**Step 3: Create sample .env for local testing**

```bash
cp .env.example .env
# Edit .env with real values to test
```

**Step 4: Final commit**

```bash
git add -A
git commit -m "chore: final cleanup and verification"
```

---

## Summary

This plan covers 11 tasks:
1. Project setup (dependencies, config)
2. Storage module (JSON persistence)
3. GitHub release fetcher
4. npm fetcher
5. VS Code Marketplace fetcher
6. Custom fetchers (VSCode, Claude CLI, CMake)
7. Fetcher registry (routing)
8. Notifier module (Telegram)
9. Checker module (orchestration)
10. Main entry point
11. Final verification

Each task follows TDD: write failing test → implement → verify → commit.
