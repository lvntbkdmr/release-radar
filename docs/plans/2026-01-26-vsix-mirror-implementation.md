# VSIX Mirror Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Automatically mirror VS Code Claude Code extension to GitHub releases for Nexus proxy access.

**Architecture:** When version check detects Claude Code VSCode update, download VSIX from marketplace, upload to `lvntbkdmr/apps` GitHub repo as a release, store the GitHub URL for CLI publishing.

**Tech Stack:** TypeScript, Node.js child_process (execSync), gh CLI, curl

---

## Task 1: Add mirrorUrls to Storage

**Files:**
- Modify: `src/types.ts` (no changes needed - StorageState is in storage.ts)
- Modify: `src/storage.ts:4-7` (StorageState interface)
- Test: `src/storage.test.ts`

**Step 1: Write failing test for getMirrorUrl**

Add to `src/storage.test.ts`:

```typescript
it('getMirrorUrl returns null for unknown tool', () => {
  expect(storage.getMirrorUrl('Unknown')).toBeNull();
});

it('getMirrorUrl returns stored mirror URL', () => {
  const state = {
    lastCheck: null,
    versions: {},
    mirrorUrls: { 'Claude Code VSCode': 'github.com/lvntbkdmr/apps/releases/download/v1/file.vsix' }
  };
  writeFileSync(testPath, JSON.stringify(state));
  storage = new Storage(testPath);

  expect(storage.getMirrorUrl('Claude Code VSCode')).toBe('github.com/lvntbkdmr/apps/releases/download/v1/file.vsix');
});

it('setMirrorUrl updates and persists', () => {
  storage.setMirrorUrl('Claude Code VSCode', 'github.com/test/url.vsix');

  const newStorage = new Storage(testPath);
  expect(newStorage.getMirrorUrl('Claude Code VSCode')).toBe('github.com/test/url.vsix');
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/storage.test.ts`
Expected: FAIL - getMirrorUrl is not a function

**Step 3: Implement Storage changes**

Update `src/storage.ts`:

```typescript
// Update StorageState interface (line 4-7)
export interface StorageState {
  lastCheck: string | null;
  versions: Record<string, string>;
  mirrorUrls?: Record<string, string>;
}

// Add after setVersion method (after line 45)
getMirrorUrl(toolName: string): string | null {
  const state = this.ensureLoaded();
  return state.mirrorUrls?.[toolName] ?? null;
}

setMirrorUrl(toolName: string, url: string): void {
  const state = this.ensureLoaded();
  if (!state.mirrorUrls) {
    state.mirrorUrls = {};
  }
  state.mirrorUrls[toolName] = url;
  this.save(state);
}

getAllMirrorUrls(): Record<string, string> {
  const state = this.ensureLoaded();
  return state.mirrorUrls ?? {};
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/storage.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/storage.ts src/storage.test.ts
git commit -m "feat(storage): add mirrorUrls support for VSIX mirroring"
```

---

## Task 2: Create VsixMirror Module

**Files:**
- Create: `src/vsix-mirror.ts`
- Create: `src/vsix-mirror.test.ts`

**Step 1: Write failing test for VsixMirror**

Create `src/vsix-mirror.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VsixMirror } from './vsix-mirror.js';
import { execSync } from 'child_process';

vi.mock('child_process', () => ({
  execSync: vi.fn()
}));

describe('VsixMirror', () => {
  let mirror: VsixMirror;

  beforeEach(() => {
    vi.clearAllMocks();
    mirror = new VsixMirror();
  });

  describe('mirror', () => {
    it('returns existing URL if release already exists', async () => {
      // gh release view succeeds = release exists
      vi.mocked(execSync).mockReturnValueOnce(Buffer.from(''));

      const result = await mirror.mirror('2.1.9');

      expect(result.success).toBe(true);
      expect(result.downloadUrl).toBe(
        'github.com/lvntbkdmr/apps/releases/download/claude-code-vsix-v2.1.9/claude-code-2.1.9-win32-x64.vsix'
      );
      // Should not attempt to create release
      expect(execSync).toHaveBeenCalledTimes(1);
    });

    it('returns error when marketplace query fails', async () => {
      // gh release view fails = release does not exist
      vi.mocked(execSync).mockImplementationOnce(() => {
        throw new Error('release not found');
      });
      // curl for marketplace query fails
      vi.mocked(execSync).mockImplementationOnce(() => {
        throw new Error('network error');
      });

      const result = await mirror.mirror('2.1.9');

      expect(result.success).toBe(false);
      expect(result.error).toContain('network error');
    });
  });

  describe('releaseExists', () => {
    it('returns true when release exists', async () => {
      vi.mocked(execSync).mockReturnValueOnce(Buffer.from(''));

      const exists = await mirror.releaseExists('claude-code-vsix-v2.1.9');

      expect(exists).toBe(true);
      expect(execSync).toHaveBeenCalledWith(
        'gh release view claude-code-vsix-v2.1.9 --repo lvntbkdmr/apps',
        expect.any(Object)
      );
    });

    it('returns false when release does not exist', async () => {
      vi.mocked(execSync).mockImplementationOnce(() => {
        throw new Error('release not found');
      });

      const exists = await mirror.releaseExists('claude-code-vsix-v2.1.9');

      expect(exists).toBe(false);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/vsix-mirror.test.ts`
Expected: FAIL - Cannot find module './vsix-mirror.js'

**Step 3: Implement VsixMirror class**

Create `src/vsix-mirror.ts`:

```typescript
// src/vsix-mirror.ts
import { execSync } from 'child_process';
import { unlinkSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

export interface MirrorResult {
  success: boolean;
  downloadUrl?: string;
  error?: string;
}

export class VsixMirror {
  private repo = 'lvntbkdmr/apps';
  private extensionId = 'anthropic.claude-code';
  private targetPlatform = 'win32-x64';

  async mirror(version: string): Promise<MirrorResult> {
    const tag = `claude-code-vsix-v${version}`;
    const filename = `claude-code-${version}-win32-x64.vsix`;
    const downloadUrl = `github.com/${this.repo}/releases/download/${tag}/${filename}`;

    try {
      // Check if release already exists
      if (await this.releaseExists(tag)) {
        console.log(`[VsixMirror] Release ${tag} already exists, skipping`);
        return { success: true, downloadUrl };
      }

      // Get VSIX URL from marketplace
      console.log(`[VsixMirror] Querying marketplace for ${this.extensionId} v${version}...`);
      const vsixUrl = await this.getMarketplaceVsixUrl(version);

      // Download VSIX to temp file
      const tempPath = join(tmpdir(), filename);
      console.log(`[VsixMirror] Downloading VSIX to ${tempPath}...`);
      await this.downloadVsix(vsixUrl, tempPath);

      // Create GitHub release with VSIX attached
      console.log(`[VsixMirror] Creating release ${tag}...`);
      await this.createRelease(tag, tempPath, filename, version);

      // Cleanup temp file
      if (existsSync(tempPath)) {
        unlinkSync(tempPath);
      }

      console.log(`[VsixMirror] Successfully mirrored to ${downloadUrl}`);
      return { success: true, downloadUrl };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[VsixMirror] Failed to mirror: ${message}`);
      return { success: false, error: message };
    }
  }

  async releaseExists(tag: string): Promise<boolean> {
    try {
      execSync(`gh release view ${tag} --repo ${this.repo}`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return true;
    } catch {
      return false;
    }
  }

  private async getMarketplaceVsixUrl(version: string): Promise<string> {
    const query = JSON.stringify({
      filters: [{
        criteria: [{ filterType: 7, value: this.extensionId }],
        pageNumber: 1,
        pageSize: 1,
      }],
      flags: 3,
    });

    const cmd = `curl -sS 'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery' ` +
      `-H 'Accept: application/json; api-version=7.2-preview.1' ` +
      `-H 'Content-Type: application/json' ` +
      `--data '${query}'`;

    const response = execSync(cmd, { encoding: 'utf-8', timeout: 30000 });
    const data = JSON.parse(response);

    const versions = data.results?.[0]?.extensions?.[0]?.versions || [];
    const targetVersion = versions.find(
      (v: any) => v.version === version && v.targetPlatform === this.targetPlatform
    );

    if (!targetVersion) {
      throw new Error(`Version ${version} for ${this.targetPlatform} not found in marketplace`);
    }

    const vsixFile = targetVersion.files?.find(
      (f: any) => f.assetType === 'Microsoft.VisualStudio.Services.VSIXPackage'
    );

    if (!vsixFile?.source) {
      throw new Error('VSIX download URL not found in marketplace response');
    }

    return vsixFile.source;
  }

  private async downloadVsix(url: string, destPath: string): Promise<void> {
    execSync(`curl -sS -L -o "${destPath}" "${url}"`, {
      encoding: 'utf-8',
      timeout: 300000, // 5 minutes for large files
    });

    if (!existsSync(destPath)) {
      throw new Error('Download failed - file not created');
    }
  }

  private async createRelease(
    tag: string,
    vsixPath: string,
    filename: string,
    version: string
  ): Promise<void> {
    const title = `Claude Code VSCode ${version}`;
    const notes = `Mirrored from VS Code Marketplace for Nexus proxy access.\\n\\nPlatform: win32-x64`;

    execSync(
      `gh release create "${tag}" "${vsixPath}#${filename}" ` +
      `--repo ${this.repo} --title "${title}" --notes "${notes}"`,
      { encoding: 'utf-8', timeout: 300000 }
    );
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/vsix-mirror.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/vsix-mirror.ts src/vsix-mirror.test.ts
git commit -m "feat: add VsixMirror module for marketplace to GitHub mirroring"
```

---

## Task 3: Update versions-generator to Handle Mirror URLs

**Files:**
- Modify: `src/versions-generator.ts`
- Modify: `src/versions-generator.test.ts`

**Step 1: Write failing test for MIRROR_URL placeholder**

Add to `src/versions-generator.test.ts`:

```typescript
it('uses mirrorUrls for MIRROR_URL placeholder', () => {
  const versions: Record<string, string> = {
    'Claude Code VSCode': '2.1.9',
  };

  const downloads: DownloadsConfig = {
    'Claude Code VSCode': {
      displayName: 'Claude Code Extension',
      downloadUrl: '{{MIRROR_URL}}',
      filename: 'claude-code-{{VERSION}}-win32-x64.vsix',
    },
  };

  const mirrorUrls: Record<string, string> = {
    'Claude Code VSCode': 'github.com/lvntbkdmr/apps/releases/download/claude-code-vsix-v2.1.9/claude-code-2.1.9-win32-x64.vsix',
  };

  const result = generateVersionsJson(versions, downloads, mirrorUrls);

  expect(result.tools).toHaveLength(1);
  const tool = result.tools[0] as VersionsJsonToolDownload;
  expect(tool.downloadUrl).toBe(
    '{{NEXUS_URL}}/github.com/lvntbkdmr/apps/releases/download/claude-code-vsix-v2.1.9/claude-code-2.1.9-win32-x64.vsix'
  );
  expect(tool.filename).toBe('claude-code-2.1.9-win32-x64.vsix');
});

it('skips tool with MIRROR_URL placeholder when no mirrorUrl available', () => {
  const versions: Record<string, string> = {
    'Claude Code VSCode': '2.1.9',
    'Ninja': '1.12.0',
  };

  const downloads: DownloadsConfig = {
    'Claude Code VSCode': {
      displayName: 'Claude Code Extension',
      downloadUrl: '{{MIRROR_URL}}',
      filename: 'claude-code-{{VERSION}}-win32-x64.vsix',
    },
    'Ninja': {
      displayName: 'Ninja',
      downloadUrl: 'github.com/ninja/releases/{{VERSION}}/ninja.zip',
      filename: 'ninja-{{VERSION}}.zip',
    },
  };

  // No mirrorUrls provided for Claude Code VSCode
  const result = generateVersionsJson(versions, downloads, {});

  expect(result.tools).toHaveLength(1);
  expect(result.tools[0].name).toBe('Ninja');
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/versions-generator.test.ts`
Expected: FAIL - generateVersionsJson expects 2 arguments

**Step 3: Update generateVersionsJson**

Modify `src/versions-generator.ts`:

```typescript
import type { DownloadsConfig, VersionsJson, VersionsJsonTool } from './types.js';

// Extract base version (e.g., "2.52.0" from "2.52.0.windows.1")
function getVersionBase(version: string): string {
  const match = version.match(/^(\d+\.\d+\.\d+)/);
  return match ? match[1] : version;
}

function applyVersionPlaceholders(template: string, version: string): string {
  return template
    .replace(/\{\{VERSION\}\}/g, version)
    .replace(/\{\{VERSION_BASE\}\}/g, getVersionBase(version));
}

export function generateVersionsJson(
  versions: Record<string, string>,
  downloads: DownloadsConfig,
  mirrorUrls: Record<string, string> = {}
): VersionsJson {
  const tools: VersionsJsonTool[] = [];

  for (const [toolName, version] of Object.entries(versions)) {
    const downloadConfig = downloads[toolName];
    if (!downloadConfig) continue;

    if (downloadConfig.type === 'npm') {
      // npm package - no download URL, just package name
      tools.push({
        name: toolName,
        displayName: downloadConfig.displayName,
        version,
        publishedAt: new Date().toISOString(),
        type: 'npm',
        package: downloadConfig.package,
      });
    } else {
      // Check if this uses MIRROR_URL placeholder
      if (downloadConfig.downloadUrl === '{{MIRROR_URL}}') {
        const mirrorUrl = mirrorUrls[toolName];
        if (!mirrorUrl) {
          // Skip this tool - no mirror URL available
          console.log(`[versions-generator] Skipping ${toolName}: no mirror URL available`);
          continue;
        }
        const downloadUrl = '{{NEXUS_URL}}/' + mirrorUrl;
        const filename = applyVersionPlaceholders(downloadConfig.filename, version);

        tools.push({
          name: toolName,
          displayName: downloadConfig.displayName,
          version,
          publishedAt: new Date().toISOString(),
          downloadUrl,
          filename,
        });
      } else {
        // download type (default) with version template
        const downloadUrl = '{{NEXUS_URL}}/' +
          applyVersionPlaceholders(downloadConfig.downloadUrl, version);
        const filename = applyVersionPlaceholders(downloadConfig.filename, version);

        tools.push({
          name: toolName,
          displayName: downloadConfig.displayName,
          version,
          publishedAt: new Date().toISOString(),
          downloadUrl,
          filename,
        });
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    tools,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/versions-generator.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/versions-generator.ts src/versions-generator.test.ts
git commit -m "feat(versions-generator): support MIRROR_URL placeholder for mirrored assets"
```

---

## Task 4: Update CliPublisher to Pass Mirror URLs

**Files:**
- Modify: `src/cli-publisher.ts`

**Step 1: Update CliPublisher.publish to accept mirrorUrls**

Modify `src/cli-publisher.ts`:

```typescript
// Update the publish method signature (line 42)
async publish(
  versions: Record<string, string>,
  mirrorUrls: Record<string, string> = {}
): Promise<PublishResult> {
  if (!this.isConfigured()) {
    return { success: false, error: 'CLI publisher not configured' };
  }

  try {
    // Generate versions.json with mirror URLs
    const versionsJson = generateVersionsJson(versions, this.downloadsConfig, mirrorUrls);

    // ... rest of the method stays the same
```

**Step 2: Run all tests to verify nothing breaks**

Run: `npm test`
Expected: PASS (all tests)

**Step 3: Commit**

```bash
git add src/cli-publisher.ts
git commit -m "feat(cli-publisher): pass mirrorUrls to versions generator"
```

---

## Task 5: Integrate VsixMirror into Checker

**Files:**
- Modify: `src/checker.ts`
- Modify: `src/checker.test.ts`

**Step 1: Write failing test for VSIX mirroring on update**

Add to `src/checker.test.ts`:

```typescript
describe('VSIX mirroring', () => {
  let mockVsixMirror: {
    mirror: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockVsixMirror = {
      mirror: vi.fn().mockResolvedValue({ success: true, downloadUrl: 'github.com/test/url.vsix' })
    };
  });

  it('mirrors VSIX when Claude Code VSCode updates', async () => {
    const vsCodeTool: ToolConfig = {
      name: 'Claude Code VSCode',
      type: 'vscode-marketplace',
      extensionId: 'anthropic.claude-code'
    };
    const checkerWithMirror = new Checker(
      [vsCodeTool],
      mockStorage as any,
      mockNotifier as any,
      mockVsixMirror as any
    );

    mockStorage.getVersion.mockReturnValue('2.1.8');
    vi.mocked(fetchVersion).mockResolvedValue('2.1.9');

    await checkerWithMirror.checkAll();

    expect(mockVsixMirror.mirror).toHaveBeenCalledWith('2.1.9');
    expect(mockStorage.setMirrorUrl).toHaveBeenCalledWith('Claude Code VSCode', 'github.com/test/url.vsix');
  });

  it('does not mirror when version unchanged', async () => {
    const vsCodeTool: ToolConfig = {
      name: 'Claude Code VSCode',
      type: 'vscode-marketplace',
      extensionId: 'anthropic.claude-code'
    };
    const checkerWithMirror = new Checker(
      [vsCodeTool],
      mockStorage as any,
      mockNotifier as any,
      mockVsixMirror as any
    );

    mockStorage.getVersion.mockReturnValue('2.1.9');
    vi.mocked(fetchVersion).mockResolvedValue('2.1.9');

    await checkerWithMirror.checkAll();

    expect(mockVsixMirror.mirror).not.toHaveBeenCalled();
  });

  it('continues if mirror fails', async () => {
    const vsCodeTool: ToolConfig = {
      name: 'Claude Code VSCode',
      type: 'vscode-marketplace',
      extensionId: 'anthropic.claude-code'
    };
    mockVsixMirror.mirror.mockResolvedValue({ success: false, error: 'network error' });

    const checkerWithMirror = new Checker(
      [vsCodeTool],
      mockStorage as any,
      mockNotifier as any,
      mockVsixMirror as any
    );

    mockStorage.getVersion.mockReturnValue('2.1.8');
    vi.mocked(fetchVersion).mockResolvedValue('2.1.9');

    await checkerWithMirror.checkAll();

    // Version should still be updated
    expect(mockStorage.setVersion).toHaveBeenCalledWith('Claude Code VSCode', '2.1.9');
    // But no mirror URL stored
    expect(mockStorage.setMirrorUrl).not.toHaveBeenCalled();
  });
});
```

Also add `setMirrorUrl` to the mockStorage in beforeEach:

```typescript
mockStorage = {
  getVersion: vi.fn(),
  setVersion: vi.fn(),
  setMirrorUrl: vi.fn()
};
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/checker.test.ts`
Expected: FAIL - Checker constructor expects 3 arguments

**Step 3: Update Checker to accept VsixMirror**

Modify `src/checker.ts`:

```typescript
// src/checker.ts
import type { ToolConfig } from './types.js';
import type { Storage } from './storage.js';
import type { Notifier, UpdateInfo, FailureInfo } from './notifier.js';
import type { VsixMirror } from './vsix-mirror.js';
import { fetchVersion } from './fetchers/index.js';

export class Checker {
  constructor(
    private tools: ToolConfig[],
    private storage: Storage,
    private notifier: Notifier,
    private vsixMirror?: VsixMirror
  ) {}

  async checkAll(): Promise<{ hasUpdates: boolean; updateCount: number }> {
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

          // Mirror VSIX to GitHub if this is Claude Code VSCode
          if (tool.name === 'Claude Code VSCode' && this.vsixMirror) {
            const mirrorResult = await this.vsixMirror.mirror(newVersion);
            if (mirrorResult.success && mirrorResult.downloadUrl) {
              this.storage.setMirrorUrl(tool.name, mirrorResult.downloadUrl);
            }
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push({ name: tool.name, error: message });
      }
    }

    await this.notifier.sendBatchedUpdates(updates);
    await this.notifier.sendBatchedFailures(failures);

    return { hasUpdates: updates.length > 0, updateCount: updates.length };
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/checker.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/checker.ts src/checker.test.ts
git commit -m "feat(checker): integrate VSIX mirroring on Claude Code VSCode updates"
```

---

## Task 6: Wire Up in index.ts and Add /mirrorvsix Command

**Files:**
- Modify: `src/index.ts`

**Step 1: Import and instantiate VsixMirror**

Add after other imports:

```typescript
import { VsixMirror } from './vsix-mirror.js';
```

Add after `const cliPublisher = ...` (around line 115):

```typescript
const vsixMirror = new VsixMirror();
```

**Step 2: Pass VsixMirror to Checker**

Update the checker instantiation:

```typescript
const checker = new Checker(configData.tools, storage, notifier, vsixMirror);
```

**Step 3: Update CLI publish calls to include mirrorUrls**

In the scheduled check (around line 148):

```typescript
if (result.hasUpdates && cliPublisher.isConfigured()) {
  const state = storage.load();
  const mirrorUrls = storage.getAllMirrorUrls();
  const publishResult = await cliPublisher.publish(state.versions, mirrorUrls);
  // ...
}
```

In `/check` command (around line 169):

```typescript
if (result.hasUpdates && cliPublisher.isConfigured()) {
  const state = storage.load();
  const mirrorUrls = storage.getAllMirrorUrls();
  const publishResult = await cliPublisher.publish(state.versions, mirrorUrls);
  // ...
}
```

In `/publishcli` command (around line 305):

```typescript
const state = storage.load();
const mirrorUrls = storage.getAllMirrorUrls();
// ... (preview code)
const result = await cliPublisher.publish(state.versions, mirrorUrls);
```

**Step 4: Add /mirrorvsix command**

Add after `/publishcli` command:

```typescript
bot.onText(/\/mirrorvsix(?:\s+(.+))?/, async (msg, match) => {
  if (msg.chat.id.toString() !== validatedChatId) return;

  const versionArg = match?.[1]?.trim();
  const version = versionArg || storage.getVersion('Claude Code VSCode');

  if (!version) {
    await bot.sendMessage(validatedChatId, 'No version specified and no tracked version found. Usage: /mirrorvsix [version]');
    return;
  }

  await bot.sendMessage(validatedChatId, `Mirroring Claude Code VSCode v${version}...`);

  const result = await vsixMirror.mirror(version);

  if (result.success) {
    storage.setMirrorUrl('Claude Code VSCode', result.downloadUrl!);
    await bot.sendMessage(validatedChatId, `✅ Mirrored successfully\nURL: ${result.downloadUrl}`);
  } else {
    await bot.sendMessage(validatedChatId, `❌ Mirror failed: ${result.error}`);
  }
});
```

**Step 5: Run all tests**

Run: `npm test`
Expected: PASS

**Step 6: Commit**

```bash
git add src/index.ts
git commit -m "feat: wire up VsixMirror and add /mirrorvsix command"
```

---

## Task 7: Add Claude Code VSCode to downloads.json

**Files:**
- Modify: `config/downloads.json`

**Step 1: Add entry for Claude Code VSCode**

Add to `config/downloads.json`:

```json
{
  "Claude Code VSCode": {
    "displayName": "Claude Code Extension",
    "downloadUrl": "{{MIRROR_URL}}",
    "filename": "claude-code-{{VERSION}}-win32-x64.vsix"
  },
  // ... rest of existing entries
}
```

**Step 2: Run tests to ensure nothing breaks**

Run: `npm test`
Expected: PASS

**Step 3: Commit**

```bash
git add config/downloads.json
git commit -m "feat: add Claude Code VSCode to downloads config with MIRROR_URL"
```

---

## Task 8: Final Integration Test

**Step 1: Build and verify**

Run:
```bash
npm run build
```
Expected: No TypeScript errors

**Step 2: Run full test suite**

Run:
```bash
npm test
```
Expected: All tests pass

**Step 3: Manual verification (optional)**

Test `/mirrorvsix` with a known version to verify end-to-end flow works.

**Step 4: Final commit if any cleanup needed**

```bash
git status
# If any uncommitted changes:
git add -A
git commit -m "chore: cleanup after VSIX mirror integration"
```

---

## Summary

| Task | Description |
|------|-------------|
| 1 | Add mirrorUrls to Storage |
| 2 | Create VsixMirror module |
| 3 | Update versions-generator for MIRROR_URL |
| 4 | Update CliPublisher to pass mirrorUrls |
| 5 | Integrate VsixMirror into Checker |
| 6 | Wire up in index.ts + /mirrorvsix command |
| 7 | Add Claude Code VSCode to downloads.json |
| 8 | Final integration test |
