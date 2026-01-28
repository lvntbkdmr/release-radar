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
      if (!config.extensionId) {
        throw new Error('extensionId is required when sourceUrl is "marketplace-api"');
      }
      return this.getMarketplaceVsixUrl(config.extensionId, version, config.targetPlatform);
    }
    // For direct URLs, just return as-is (curl -L will follow redirects)
    return config.sourceUrl;
  }

  private async getMarketplaceVsixUrl(
    extensionId: string,
    version: string,
    targetPlatform?: string
  ): Promise<string> {
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

    // Find matching version - with or without platform filter
    const targetVersion = versions.find((v: any) => {
      if (v.version !== version) return false;
      if (targetPlatform) {
        return v.targetPlatform === targetPlatform;
      }
      // For universal extensions, targetPlatform is undefined/null
      return !v.targetPlatform;
    });

    if (!targetVersion) {
      const platformInfo = targetPlatform ? ` for ${targetPlatform}` : ' (universal)';
      throw new Error(`Version ${version}${platformInfo} not found in marketplace for ${extensionId}`);
    }

    const vsixFile = targetVersion.files?.find(
      (f: any) => f.assetType === 'Microsoft.VisualStudio.Services.VSIXPackage'
    );

    if (!vsixFile?.source) {
      throw new Error(`VSIX download URL not found in marketplace response for ${extensionId}`);
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
