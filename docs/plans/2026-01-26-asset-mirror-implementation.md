# Generic AssetMirror Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace hardcoded VsixMirror with a generic AssetMirror that mirrors any tool's assets to GitHub releases based on config.

**Architecture:** AssetMirror reads mirror config from downloads.json, handles both direct URLs (with redirect following) and marketplace-api special case. Checker passes downloadsConfig and triggers mirroring for any tool with mirror config.

**Tech Stack:** TypeScript, Node.js child_process (execSync), gh CLI, curl

---

## Task 1: Add MirrorConfig to Types

**Files:**
- Modify: `src/types.ts`

**Step 1: Add MirrorConfig interface and update DownloadConfigUrl**

Add to `src/types.ts` after line 17:

```typescript
export interface MirrorConfig {
  sourceUrl: string;  // URL or "marketplace-api"
}
```

Update `DownloadConfigUrl` interface to include optional mirror:

```typescript
export interface DownloadConfigUrl {
  type?: 'download';  // default if not specified
  displayName: string;
  downloadUrl: string;  // Template with {{VERSION}} placeholder
  filename: string;     // Template with {{VERSION}} placeholder
  mirror?: MirrorConfig;  // NEW: optional mirror config
}
```

**Step 2: Run tests to verify nothing breaks**

Run: `npm test`
Expected: All 74 tests pass

**Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat(types): add MirrorConfig interface"
```

---

## Task 2: Create AssetMirror Module

**Files:**
- Create: `src/asset-mirror.ts`
- Create: `src/asset-mirror.test.ts`

**Step 1: Write failing tests for AssetMirror**

Create `src/asset-mirror.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AssetMirror } from './asset-mirror.js';
import { execSync } from 'child_process';
import { existsSync, unlinkSync } from 'fs';

vi.mock('child_process', () => ({
  execSync: vi.fn()
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  unlinkSync: vi.fn()
}));

describe('AssetMirror', () => {
  let mirror: AssetMirror;

  beforeEach(() => {
    vi.clearAllMocks();
    mirror = new AssetMirror();
  });

  describe('buildTag', () => {
    it('converts tool name to kebab-case tag', () => {
      expect(mirror.buildTag('VSCode', '1.96.0')).toBe('vscode-v1.96.0');
      expect(mirror.buildTag('Claude Code VSCode', '2.1.9')).toBe('claude-code-vscode-v2.1.9');
      expect(mirror.buildTag('Ninja', '1.12.0')).toBe('ninja-v1.12.0');
    });
  });

  describe('mirror', () => {
    it('returns existing URL if release already exists', async () => {
      vi.mocked(execSync).mockReturnValueOnce(Buffer.from(''));

      const result = await mirror.mirror('VSCode', '1.96.0', {
        sourceUrl: 'https://update.code.visualstudio.com/latest/win32-x64/stable'
      }, 'VSCode-{{VERSION}}-win-x64.msi');

      expect(result.success).toBe(true);
      expect(result.downloadUrl).toBe(
        'github.com/lvntbkdmr/apps/releases/download/vscode-v1.96.0/VSCode-1.96.0-win-x64.msi'
      );
      expect(execSync).toHaveBeenCalledTimes(1);
    });

    it('returns error when download fails', async () => {
      // gh release view fails = release does not exist
      vi.mocked(execSync).mockImplementationOnce(() => {
        throw new Error('release not found');
      });
      // curl download fails
      vi.mocked(execSync).mockImplementationOnce(() => {
        throw new Error('network error');
      });

      const result = await mirror.mirror('VSCode', '1.96.0', {
        sourceUrl: 'https://update.code.visualstudio.com/latest/win32-x64/stable'
      }, 'VSCode-{{VERSION}}-win-x64.msi');

      expect(result.success).toBe(false);
      expect(result.error).toContain('network error');
    });

    it('handles marketplace-api source for Claude Code VSCode', async () => {
      const marketplaceResponse = JSON.stringify({
        results: [{
          extensions: [{
            versions: [{
              version: '2.1.9',
              targetPlatform: 'win32-x64',
              files: [{
                assetType: 'Microsoft.VisualStudio.Services.VSIXPackage',
                source: 'https://marketplace.visualstudio.com/vsix/download'
              }]
            }]
          }]
        }]
      });

      // 1. gh release view fails
      vi.mocked(execSync).mockImplementationOnce(() => {
        throw new Error('release not found');
      });
      // 2. curl marketplace query succeeds
      vi.mocked(execSync).mockReturnValueOnce(marketplaceResponse);
      // 3. curl download succeeds
      vi.mocked(execSync).mockReturnValueOnce('');
      // 4. gh release create succeeds
      vi.mocked(execSync).mockReturnValueOnce('');

      vi.mocked(existsSync).mockReturnValue(true);

      const result = await mirror.mirror('Claude Code VSCode', '2.1.9', {
        sourceUrl: 'marketplace-api'
      }, 'claude-code-{{VERSION}}-win32-x64.vsix');

      expect(result.success).toBe(true);
      expect(result.downloadUrl).toBe(
        'github.com/lvntbkdmr/apps/releases/download/claude-code-vscode-v2.1.9/claude-code-2.1.9-win32-x64.vsix'
      );
    });

    it('successfully mirrors direct URL through full flow', async () => {
      // 1. gh release view fails
      vi.mocked(execSync).mockImplementationOnce(() => {
        throw new Error('release not found');
      });
      // 2. curl download succeeds
      vi.mocked(execSync).mockReturnValueOnce('');
      // 3. gh release create succeeds
      vi.mocked(execSync).mockReturnValueOnce('');

      vi.mocked(existsSync).mockReturnValue(true);

      const result = await mirror.mirror('VSCode', '1.96.0', {
        sourceUrl: 'https://update.code.visualstudio.com/latest/win32-x64/stable'
      }, 'VSCode-{{VERSION}}-win-x64.msi');

      expect(result.success).toBe(true);
      expect(execSync).toHaveBeenCalledTimes(3);
      expect(unlinkSync).toHaveBeenCalled();
    });
  });

  describe('releaseExists', () => {
    it('returns true when release exists', async () => {
      vi.mocked(execSync).mockReturnValueOnce(Buffer.from(''));

      const exists = await mirror.releaseExists('vscode-v1.96.0');

      expect(exists).toBe(true);
    });

    it('returns false when release does not exist', async () => {
      vi.mocked(execSync).mockImplementationOnce(() => {
        throw new Error('release not found');
      });

      const exists = await mirror.releaseExists('vscode-v1.96.0');

      expect(exists).toBe(false);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/asset-mirror.test.ts`
Expected: FAIL - Cannot find module './asset-mirror.js'

**Step 3: Implement AssetMirror class**

Create `src/asset-mirror.ts`:

```typescript
// src/asset-mirror.ts
import { execSync } from 'child_process';
import { unlinkSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { MirrorConfig } from './types.js';

export interface MirrorResult {
  success: boolean;
  downloadUrl?: string;
  error?: string;
}

export class AssetMirror {
  private repo = 'lvntbkdmr/apps';

  async mirror(
    toolName: string,
    version: string,
    config: MirrorConfig,
    filenameTemplate: string
  ): Promise<MirrorResult> {
    const tag = this.buildTag(toolName, version);
    const filename = this.applyVersion(filenameTemplate, version);
    const downloadUrl = `github.com/${this.repo}/releases/download/${tag}/${filename}`;

    try {
      // Check if release already exists
      if (await this.releaseExists(tag)) {
        console.log(`[AssetMirror] Release ${tag} already exists, skipping`);
        return { success: true, downloadUrl };
      }

      // Get actual source URL
      console.log(`[AssetMirror] Getting source URL for ${toolName} v${version}...`);
      const sourceUrl = await this.getSourceUrl(config, version);

      // Download to temp file
      const tempPath = join(tmpdir(), filename);
      console.log(`[AssetMirror] Downloading to ${tempPath}...`);
      await this.downloadFile(sourceUrl, tempPath);

      // Create GitHub release with asset attached
      console.log(`[AssetMirror] Creating release ${tag}...`);
      await this.createRelease(tag, tempPath, filename, toolName, version);

      // Cleanup temp file
      if (existsSync(tempPath)) {
        unlinkSync(tempPath);
      }

      console.log(`[AssetMirror] Successfully mirrored to ${downloadUrl}`);
      return { success: true, downloadUrl };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[AssetMirror] Failed to mirror ${toolName}: ${message}`);
      return { success: false, error: message };
    }
  }

  buildTag(toolName: string, version: string): string {
    const kebab = toolName.toLowerCase().replace(/\s+/g, '-');
    return `${kebab}-v${version}`;
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

  private applyVersion(template: string, version: string): string {
    return template.replace(/\{\{VERSION\}\}/g, version);
  }

  private async getSourceUrl(config: MirrorConfig, version: string): Promise<string> {
    if (config.sourceUrl === 'marketplace-api') {
      return this.getMarketplaceVsixUrl(version);
    }
    // For direct URLs, just return as-is (curl -L will follow redirects)
    return config.sourceUrl;
  }

  private async getMarketplaceVsixUrl(version: string): Promise<string> {
    const extensionId = 'anthropic.claude-code';
    const targetPlatform = 'win32-x64';

    const query = JSON.stringify({
      filters: [{
        criteria: [{ filterType: 7, value: extensionId }],
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
      (v: any) => v.version === version && v.targetPlatform === targetPlatform
    );

    if (!targetVersion) {
      throw new Error(`Version ${version} for ${targetPlatform} not found in marketplace`);
    }

    const vsixFile = targetVersion.files?.find(
      (f: any) => f.assetType === 'Microsoft.VisualStudio.Services.VSIXPackage'
    );

    if (!vsixFile?.source) {
      throw new Error('VSIX download URL not found in marketplace response');
    }

    return vsixFile.source;
  }

  private async downloadFile(url: string, destPath: string): Promise<void> {
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
    filePath: string,
    filename: string,
    toolName: string,
    version: string
  ): Promise<void> {
    const title = `${toolName} ${version}`;
    const notes = `Mirrored for Nexus proxy access.`;

    execSync(
      `gh release create "${tag}" "${filePath}#${filename}" ` +
      `--repo ${this.repo} --title "${title}" --notes "${notes}"`,
      { encoding: 'utf-8', timeout: 300000 }
    );
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/asset-mirror.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/asset-mirror.ts src/asset-mirror.test.ts
git commit -m "feat: add generic AssetMirror module"
```

---

## Task 3: Update Checker to Use AssetMirror with Config

**Files:**
- Modify: `src/checker.ts`
- Modify: `src/checker.test.ts`

**Step 1: Write failing tests for config-based mirroring**

Update `src/checker.test.ts` - replace the VSIX mirroring tests with new ones:

Add import for DownloadsConfig:
```typescript
import type { ToolConfig, DownloadsConfig } from './types.js';
```

Update mockStorage to include setMirrorUrl (already there), and add mockAssetMirror.

Replace the `describe('VSIX mirroring', ...)` block with:

```typescript
describe('Asset mirroring', () => {
  let mockAssetMirror: {
    mirror: ReturnType<typeof vi.fn>;
  };
  let downloadsConfig: DownloadsConfig;

  beforeEach(() => {
    mockAssetMirror = {
      mirror: vi.fn().mockResolvedValue({ success: true, downloadUrl: 'github.com/test/url' })
    };
    downloadsConfig = {
      'VSCode': {
        displayName: 'VS Code',
        downloadUrl: '{{MIRROR_URL}}',
        filename: 'VSCode-{{VERSION}}-win-x64.msi',
        mirror: { sourceUrl: 'https://update.code.visualstudio.com/latest/win32-x64/stable' }
      },
      'Ninja': {
        displayName: 'Ninja',
        downloadUrl: 'github.com/ninja/releases/{{VERSION}}/ninja.zip',
        filename: 'ninja-{{VERSION}}.zip'
        // No mirror config
      }
    };
  });

  it('mirrors asset when tool has mirror config and version updates', async () => {
    const vscodeTool: ToolConfig = { name: 'VSCode', type: 'custom', customFetcher: 'vscode' };
    const checkerWithMirror = new Checker(
      [vscodeTool],
      mockStorage as any,
      mockNotifier as any,
      mockAssetMirror as any,
      downloadsConfig
    );

    mockStorage.getVersion.mockReturnValue('1.95.0');
    vi.mocked(fetchVersion).mockResolvedValue('1.96.0');

    await checkerWithMirror.checkAll();

    expect(mockAssetMirror.mirror).toHaveBeenCalledWith(
      'VSCode',
      '1.96.0',
      { sourceUrl: 'https://update.code.visualstudio.com/latest/win32-x64/stable' },
      'VSCode-{{VERSION}}-win-x64.msi'
    );
    expect(mockStorage.setMirrorUrl).toHaveBeenCalledWith('VSCode', 'github.com/test/url');
  });

  it('does not mirror when tool has no mirror config', async () => {
    const ninjaTool: ToolConfig = { name: 'Ninja', type: 'github', repo: 'ninja-build/ninja' };
    const checkerWithMirror = new Checker(
      [ninjaTool],
      mockStorage as any,
      mockNotifier as any,
      mockAssetMirror as any,
      downloadsConfig
    );

    mockStorage.getVersion.mockReturnValue('1.11.0');
    vi.mocked(fetchVersion).mockResolvedValue('1.12.0');

    await checkerWithMirror.checkAll();

    expect(mockAssetMirror.mirror).not.toHaveBeenCalled();
  });

  it('does not mirror when version unchanged', async () => {
    const vscodeTool: ToolConfig = { name: 'VSCode', type: 'custom', customFetcher: 'vscode' };
    const checkerWithMirror = new Checker(
      [vscodeTool],
      mockStorage as any,
      mockNotifier as any,
      mockAssetMirror as any,
      downloadsConfig
    );

    mockStorage.getVersion.mockReturnValue('1.96.0');
    vi.mocked(fetchVersion).mockResolvedValue('1.96.0');

    await checkerWithMirror.checkAll();

    expect(mockAssetMirror.mirror).not.toHaveBeenCalled();
  });

  it('continues if mirror fails', async () => {
    const vscodeTool: ToolConfig = { name: 'VSCode', type: 'custom', customFetcher: 'vscode' };
    mockAssetMirror.mirror.mockResolvedValue({ success: false, error: 'network error' });

    const checkerWithMirror = new Checker(
      [vscodeTool],
      mockStorage as any,
      mockNotifier as any,
      mockAssetMirror as any,
      downloadsConfig
    );

    mockStorage.getVersion.mockReturnValue('1.95.0');
    vi.mocked(fetchVersion).mockResolvedValue('1.96.0');

    await checkerWithMirror.checkAll();

    expect(mockStorage.setVersion).toHaveBeenCalledWith('VSCode', '1.96.0');
    expect(mockStorage.setMirrorUrl).not.toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/checker.test.ts`
Expected: FAIL - Checker constructor expects 4 arguments (not 5)

**Step 3: Update Checker to accept downloadsConfig and use AssetMirror**

Modify `src/checker.ts`:

```typescript
// src/checker.ts
import type { ToolConfig, DownloadsConfig, DownloadConfigUrl } from './types.js';
import type { Storage } from './storage.js';
import type { Notifier, UpdateInfo, FailureInfo } from './notifier.js';
import type { AssetMirror } from './asset-mirror.js';
import { fetchVersion } from './fetchers/index.js';

export class Checker {
  constructor(
    private tools: ToolConfig[],
    private storage: Storage,
    private notifier: Notifier,
    private assetMirror?: AssetMirror,
    private downloadsConfig?: DownloadsConfig
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

          // Mirror asset if configured
          await this.mirrorIfConfigured(tool.name, newVersion);
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

  private async mirrorIfConfigured(toolName: string, version: string): Promise<void> {
    if (!this.assetMirror || !this.downloadsConfig) return;

    const downloadConfig = this.downloadsConfig[toolName];
    if (!downloadConfig || downloadConfig.type === 'npm') return;

    const urlConfig = downloadConfig as DownloadConfigUrl;
    if (!urlConfig.mirror) return;

    const result = await this.assetMirror.mirror(
      toolName,
      version,
      urlConfig.mirror,
      urlConfig.filename
    );

    if (result.success && result.downloadUrl) {
      this.storage.setMirrorUrl(toolName, result.downloadUrl);
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/checker.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/checker.ts src/checker.test.ts
git commit -m "feat(checker): use AssetMirror with config-based mirroring"
```

---

## Task 4: Update index.ts to Use AssetMirror

**Files:**
- Modify: `src/index.ts`

**Step 1: Replace VsixMirror with AssetMirror and update Checker instantiation**

In `src/index.ts`:

1. Replace import (line 15):
```typescript
import { AssetMirror } from './asset-mirror.js';
```

2. Replace instantiation (around line 116):
```typescript
const assetMirror = new AssetMirror();
const checker = new Checker(configData.tools, storage, notifier, assetMirror, downloadsConfig);
```

**Step 2: Replace /mirrorvsix command with generic /mirror command**

Replace the `/mirrorvsix` command (lines 319-340) with:

```typescript
bot.onText(/\/mirror(?:\s+(.+))?/, async (msg, match) => {
  if (msg.chat.id.toString() !== validatedChatId) return;

  const args = match?.[1]?.trim();
  if (!args) {
    await bot.sendMessage(validatedChatId, 'Usage: /mirror <toolname> [version]\nExample: /mirror VSCode\nExample: /mirror "Claude Code VSCode" 2.1.9');
    return;
  }

  // Parse tool name and optional version
  let toolName: string;
  let version: string | null;

  const quoteMatch = args.match(/^"([^"]+)"(?:\s+(.+))?$/);
  if (quoteMatch) {
    toolName = quoteMatch[1];
    version = quoteMatch[2]?.trim() || null;
  } else {
    const parts = args.split(/\s+/);
    toolName = parts[0];
    version = parts[1] || null;
  }

  // Get download config for this tool
  const downloadConfig = downloadsConfig[toolName];
  if (!downloadConfig || downloadConfig.type === 'npm' || !('mirror' in downloadConfig) || !downloadConfig.mirror) {
    await bot.sendMessage(validatedChatId, `Tool "${toolName}" is not configured for mirroring.`);
    return;
  }

  // Get version if not provided
  if (!version) {
    version = storage.getVersion(toolName);
  }

  if (!version) {
    await bot.sendMessage(validatedChatId, `No version specified and no tracked version found for "${toolName}".`);
    return;
  }

  await bot.sendMessage(validatedChatId, `Mirroring ${toolName} v${version}...`);

  const result = await assetMirror.mirror(toolName, version, downloadConfig.mirror, downloadConfig.filename);

  if (result.success) {
    storage.setMirrorUrl(toolName, result.downloadUrl!);
    await bot.sendMessage(validatedChatId, `✅ Mirrored successfully\nURL: ${result.downloadUrl}`);
  } else {
    await bot.sendMessage(validatedChatId, `❌ Mirror failed: ${result.error}`);
  }
});
```

**Step 3: Run all tests**

Run: `npm test`
Expected: All tests pass

**Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: replace VsixMirror with AssetMirror and add generic /mirror command"
```

---

## Task 5: Update downloads.json with Mirror Configs

**Files:**
- Modify: `config/downloads.json`

**Step 1: Add mirror config to VSCode entry**

Add new VSCode entry at the beginning of `config/downloads.json`:

```json
{
  "VSCode": {
    "displayName": "VS Code",
    "downloadUrl": "{{MIRROR_URL}}",
    "filename": "VSCode-{{VERSION}}-win-x64.msi",
    "mirror": {
      "sourceUrl": "https://update.code.visualstudio.com/latest/win32-x64/stable"
    }
  },
  ...
}
```

**Step 2: Update Claude Code VSCode entry to use mirror config**

Update the existing Claude Code VSCode entry:

```json
{
  "Claude Code VSCode": {
    "displayName": "Claude Code Extension",
    "downloadUrl": "{{MIRROR_URL}}",
    "filename": "claude-code-{{VERSION}}-win32-x64.vsix",
    "mirror": {
      "sourceUrl": "marketplace-api"
    }
  },
  ...
}
```

**Step 3: Run tests**

Run: `npm test`
Expected: All tests pass

**Step 4: Commit**

```bash
git add config/downloads.json
git commit -m "feat: add mirror config for VSCode and Claude Code VSCode"
```

---

## Task 6: Delete Old VsixMirror Files

**Files:**
- Delete: `src/vsix-mirror.ts`
- Delete: `src/vsix-mirror.test.ts`

**Step 1: Delete the files**

```bash
rm src/vsix-mirror.ts src/vsix-mirror.test.ts
```

**Step 2: Run tests to verify nothing breaks**

Run: `npm test`
Expected: All tests pass (should be fewer tests now since vsix-mirror tests are gone)

**Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove deprecated VsixMirror module"
```

---

## Task 7: Final Integration Test

**Step 1: Build and verify**

Run: `npm run build`
Expected: No TypeScript errors

**Step 2: Run full test suite**

Run: `npm test`
Expected: All tests pass

**Step 3: Verify git status**

Run: `git status`
Expected: No uncommitted changes

---

## Summary

| Task | Description |
|------|-------------|
| 1 | Add MirrorConfig to types |
| 2 | Create AssetMirror module |
| 3 | Update Checker to use AssetMirror with config |
| 4 | Update index.ts with AssetMirror and /mirror command |
| 5 | Update downloads.json with mirror configs |
| 6 | Delete old VsixMirror files |
| 7 | Final integration test |
