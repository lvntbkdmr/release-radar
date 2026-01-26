# Generic Asset Mirror Feature

## Overview

Replace the hardcoded VsixMirror with a generic AssetMirror that can mirror any tool's assets to GitHub releases based on configuration in downloads.json.

## Configuration

Tools that need mirroring add a `mirror` object to their downloads.json entry:

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
  "Claude Code VSCode": {
    "displayName": "Claude Code Extension",
    "downloadUrl": "{{MIRROR_URL}}",
    "filename": "claude-code-{{VERSION}}-win32-x64.vsix",
    "mirror": {
      "sourceUrl": "marketplace-api"
    }
  }
}
```

**Fields:**
- `mirror.sourceUrl` - Download source URL, or `"marketplace-api"` for VS Code Marketplace API query
- `{{MIRROR_URL}}` placeholder - Tells versions-generator to use stored GitHub URL

**Tag naming:** Derived automatically from tool name in kebab-case + version:
- `"VSCode"` → `vscode-v1.96.0`
- `"Claude Code VSCode"` → `claude-code-vscode-v2.1.9`

## AssetMirror Module

```typescript
// src/asset-mirror.ts

export interface MirrorConfig {
  sourceUrl: string;  // URL or "marketplace-api"
}

export interface MirrorResult {
  success: boolean;
  downloadUrl?: string;
  error?: string;
}

export class AssetMirror {
  private repo = 'lvntbkdmr/apps';

  async mirror(toolName: string, version: string, config: MirrorConfig): Promise<MirrorResult> {
    const tag = this.buildTag(toolName, version);
    const filename = this.buildFilename(toolName, version);
    const downloadUrl = `github.com/${this.repo}/releases/download/${tag}/${filename}`;

    // 1. Check if release already exists → return existing URL
    // 2. Get actual download URL (resolve redirects or query marketplace-api)
    // 3. Download file to temp
    // 4. Create GitHub release with asset attached
    // 5. Cleanup and return GitHub download URL
  }

  private buildTag(toolName: string, version: string): string {
    const kebab = toolName.toLowerCase().replace(/\s+/g, '-');
    return `${kebab}-v${version}`;
  }

  private buildFilename(toolName: string, version: string): string {
    // Derive sensible filename based on tool name and version
  }

  private async getSourceUrl(config: MirrorConfig, version: string): Promise<string> {
    if (config.sourceUrl === 'marketplace-api') {
      return this.getMarketplaceVsixUrl(version);
    }
    // For direct URLs, follow redirects to get actual file URL
    return this.resolveRedirects(config.sourceUrl);
  }
}
```

## Checker Integration

Checker receives downloadsConfig and mirrors any tool with a `mirror` config:

```typescript
export class Checker {
  constructor(
    private tools: ToolConfig[],
    private storage: Storage,
    private notifier: Notifier,
    private assetMirror: AssetMirror,
    private downloadsConfig: DownloadsConfig
  ) {}

  async checkAll() {
    for (const tool of this.tools) {
      const newVersion = await fetchVersion(tool);
      const oldVersion = this.storage.getVersion(tool.name);

      if (oldVersion !== newVersion) {
        this.storage.setVersion(tool.name, newVersion);

        // Mirror if configured
        const downloadConfig = this.downloadsConfig[tool.name];
        if (downloadConfig?.mirror && this.assetMirror) {
          const result = await this.assetMirror.mirror(
            tool.name,
            newVersion,
            downloadConfig.mirror
          );
          if (result.success && result.downloadUrl) {
            this.storage.setMirrorUrl(tool.name, result.downloadUrl);
          }
        }
      }
    }
  }
}
```

## Telegram Command

Replace `/mirrorvsix [version]` with generic `/mirror <toolname> [version]`:

```
/mirror VSCode           - Mirror current tracked version
/mirror VSCode 1.96.0    - Mirror specific version
/mirror "Claude Code VSCode" 2.1.9
```

## Files to Create/Modify

### New Files
| File | Purpose |
|------|---------|
| `src/asset-mirror.ts` | Generic AssetMirror class |
| `src/asset-mirror.test.ts` | Tests |

### Modified Files
| File | Changes |
|------|---------|
| `src/checker.ts` | Accept downloadsConfig, use AssetMirror for any tool with mirror config |
| `src/checker.test.ts` | Update tests |
| `src/index.ts` | Replace VsixMirror with AssetMirror, pass downloadsConfig to Checker, update command |
| `src/types.ts` | Add MirrorConfig type |
| `config/downloads.json` | Add mirror config for VSCode, update Claude Code VSCode |

### Deleted Files
| File | Reason |
|------|---------|
| `src/vsix-mirror.ts` | Replaced by AssetMirror |
| `src/vsix-mirror.test.ts` | Replaced |

## Error Handling

Same as current VsixMirror:
1. Log error
2. Notify via Telegram
3. Still store version update
4. Skip tool in CLI publish if no mirrorUrl
5. `/mirror` command for manual retry
