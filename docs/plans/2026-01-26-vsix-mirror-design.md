# Claude Code VSCode VSIX Mirror Feature

## Overview

Automatically mirror VS Code Claude Code extension (win32-x64) to GitHub releases on `lvntbkdmr/apps` so it can be downloaded through Nexus proxy on intranet machines.

## Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    checker.checkAll()                           │
└──────────────────────────┬──────────────────────────────────────┘
                           │ detects "Claude Code VSCode" update
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│              VsixMirror.mirror(version)                         │
│  1. Query VS Code Marketplace API for win32-x64 VSIX URL        │
│  2. Download VSIX to temp file                                  │
│  3. Check if GitHub release already exists → skip if yes        │
│  4. Create release on lvntbkdmr/apps with VSIX attached         │
│  5. Return GitHub asset download URL                            │
└──────────────────────────┬──────────────────────────────────────┘
                           │ URL stored for CLI publish
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│              cliPublisher.publish(versions)                     │
│  versions.json includes GitHub URL for Claude Code VSCode       │
└─────────────────────────────────────────────────────────────────┘
```

## New Module: vsix-mirror.ts

```typescript
// src/vsix-mirror.ts

export interface MirrorResult {
  success: boolean;
  downloadUrl?: string;  // e.g. github.com/lvntbkdmr/apps/releases/download/claude-code-vsix-v2.1.9/claude-code-2.1.9-win32-x64.vsix
  error?: string;
}

export class VsixMirror {
  private repo = 'lvntbkdmr/apps';

  async mirror(version: string): Promise<MirrorResult>;
  private releaseExists(tag: string): Promise<boolean>;
  private getMarketplaceVsixUrl(version: string): Promise<string>;
  private downloadVsix(url: string, destPath: string): Promise<void>;
  private createRelease(tag: string, vsixPath: string, filename: string): Promise<string>;
}
```

### GitHub Release Structure

- **Tag:** `claude-code-vsix-v{VERSION}` (e.g., `claude-code-vsix-v2.1.9`)
- **Asset filename:** `claude-code-{VERSION}-win32-x64.vsix`
- **Platform:** Windows x64 only

### VS Code Marketplace API

Query the Extension Query API to get platform-specific VSIX URL:

```bash
curl -sS 'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery' \
  -H 'Accept: application/json; api-version=7.2-preview.1' \
  -H 'Content-Type: application/json' \
  --data '{"filters":[{"criteria":[{"filterType":7,"value":"anthropic.claude-code"}]}],"flags":3}' \
  | jq -r '.results[0].extensions[0].versions[]
           | select(.version=="VERSION" and .targetPlatform=="win32-x64")
           | .files[] | select(.assetType=="Microsoft.VisualStudio.Services.VSIXPackage")
           | .source'
```

## Integration with Checker

In `checker.ts`, after detecting a version update for "Claude Code VSCode":

```typescript
if (oldVersion !== newVersion) {
  updates.push({ name: tool.name, oldVersion, newVersion });
  this.storage.setVersion(tool.name, newVersion);

  // Mirror VSIX to GitHub if this is Claude Code VSCode
  if (tool.name === 'Claude Code VSCode') {
    const mirrorResult = await this.vsixMirror.mirror(newVersion);
    if (mirrorResult.success && mirrorResult.downloadUrl) {
      this.storage.setMirrorUrl(tool.name, mirrorResult.downloadUrl);
    }
  }
}
```

## Storage Changes

Add `mirrorUrls` field to storage state:

```json
{
  "versions": {
    "Claude Code VSCode": "2.1.9"
  },
  "mirrorUrls": {
    "Claude Code VSCode": "github.com/lvntbkdmr/apps/releases/download/claude-code-vsix-v2.1.9/claude-code-2.1.9-win32-x64.vsix"
  }
}
```

New methods on Storage class:
- `getMirrorUrl(toolName: string): string | null`
- `setMirrorUrl(toolName: string, url: string): void`

## Downloads Config

Add entry in `config/downloads.json`:

```json
{
  "Claude Code VSCode": {
    "displayName": "Claude Code Extension",
    "downloadUrl": "{{MIRROR_URL}}",
    "filename": "claude-code-{{VERSION}}-win32-x64.vsix"
  }
}
```

The `{{MIRROR_URL}}` placeholder is handled specially by `versions-generator.ts` - it looks up the stored mirror URL instead of doing template replacement.

## Error Handling

When mirroring fails:
1. Log the error
2. Notify via Telegram: `⚠️ Failed to mirror Claude Code VSCode v{VERSION}: {error}`
3. Still store the version update (user gets notified of new version)
4. Skip this tool in CLI publish (no mirrorUrl = not in versions.json)

### Manual Retry Command

New Telegram command `/mirrorvsix [version]`:
- With version: mirror that specific version
- Without version: mirror current tracked version

## Files to Create/Modify

### New Files
| File | Purpose |
|------|---------|
| `src/vsix-mirror.ts` | VsixMirror class |

### Modified Files
| File | Changes |
|------|---------|
| `src/checker.ts` | Import VsixMirror, call mirror() on updates |
| `src/storage.ts` | Add mirrorUrls field and get/set methods |
| `src/types.ts` | Update StorageState type |
| `src/versions-generator.ts` | Handle {{MIRROR_URL}} placeholder |
| `src/cli-publisher.ts` | Pass mirrorUrls to generateVersionsJson() |
| `src/index.ts` | Add /mirrorvsix command, wire up VsixMirror |
| `config/downloads.json` | Add "Claude Code VSCode" entry |

## Dependencies

None new. Uses:
- `gh` CLI for GitHub release operations
- `curl` for downloading VSIX
