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
    const notes = `Mirrored from VS Code Marketplace for Nexus proxy access.\n\nPlatform: win32-x64`;

    execSync(
      `gh release create "${tag}" "${vsixPath}#${filename}" ` +
      `--repo ${this.repo} --title "${title}" --notes "${notes}"`,
      { encoding: 'utf-8', timeout: 300000 }
    );
  }
}
