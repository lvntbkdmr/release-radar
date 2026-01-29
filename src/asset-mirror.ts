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

export interface MirrorItem {
  toolName: string;
  version: string;
  config: MirrorConfig;
  filenameTemplate: string;
}

export interface BatchMirrorResult {
  tag: string;
  results: Map<string, MirrorResult>;
}

export class AssetMirror {
  private repo = 'lvntbkdmr/apps';

  /**
   * Mirror a single tool (legacy method, still used for /mirror command)
   */
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

  /**
   * Small delay to prevent buffer exhaustion on low-memory systems (RPi)
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Mirror multiple tools into a single batch release
   */
  async mirrorBatch(items: MirrorItem[]): Promise<BatchMirrorResult> {
    const tag = this.buildBatchTag();
    const results = new Map<string, MirrorResult>();
    const downloadedFiles: { path: string; filename: string }[] = [];

    console.log(`[AssetMirror] Starting batch mirror for ${items.length} items, tag: ${tag}`);

    // Download all files first (with delays to prevent buffer exhaustion)
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const filename = this.applyVersion(item.filenameTemplate, item.version);
      const downloadUrl = `github.com/${this.repo}/releases/download/${tag}/${filename}`;

      try {
        // Check if this specific file already exists in any release
        const existingUrl = await this.findExistingAsset(item.toolName, item.version, filename);
        if (existingUrl) {
          console.log(`[AssetMirror] ${item.toolName} v${item.version} already mirrored, skipping`);
          results.set(item.toolName, { success: true, downloadUrl: existingUrl });
          continue;
        }

        console.log(`[AssetMirror] Getting source URL for ${item.toolName} v${item.version}...`);
        const sourceUrl = await this.getSourceUrl(item.config, item.version);

        const tempPath = join(tmpdir(), filename);
        console.log(`[AssetMirror] Downloading to ${tempPath}...`);
        await this.downloadFile(sourceUrl, tempPath);

        downloadedFiles.push({ path: tempPath, filename });
        results.set(item.toolName, { success: true, downloadUrl });

        // Add delay between downloads to let buffers clear (except after last item)
        if (i < items.length - 1) {
          await this.sleep(1000);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[AssetMirror] Failed to download ${item.toolName}: ${message}`);
        results.set(item.toolName, { success: false, error: message });
        // Also add delay after failures
        if (i < items.length - 1) {
          await this.sleep(1000);
        }
      }
    }

    // Create single release with all downloaded files
    if (downloadedFiles.length > 0) {
      try {
        console.log(`[AssetMirror] Creating batch release ${tag} with ${downloadedFiles.length} assets...`);
        await this.createBatchRelease(tag, downloadedFiles, items);
        console.log(`[AssetMirror] Batch release created successfully`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[AssetMirror] Failed to create batch release: ${message}`);
        // Mark all as failed if release creation fails
        for (const file of downloadedFiles) {
          const toolName = items.find(i => 
            this.applyVersion(i.filenameTemplate, i.version) === file.filename
          )?.toolName;
          if (toolName) {
            results.set(toolName, { success: false, error: message });
          }
        }
      }

      // Cleanup temp files
      for (const file of downloadedFiles) {
        if (existsSync(file.path)) {
          unlinkSync(file.path);
        }
      }
    }

    return { tag, results };
  }

  buildTag(toolName: string, version: string): string {
    const kebab = toolName.toLowerCase().replace(/\s+/g, '-');
    return `${kebab}-v${version}`;
  }

  buildBatchTag(): string {
    const now = new Date();
    const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const time = now.toTimeString().split(' ')[0].replace(/:/g, ''); // HHMMSS
    return `batch-${date}-${time}`;
  }

  private async findExistingAsset(
    toolName: string,
    version: string,
    filename: string
  ): Promise<string | null> {
    // Check legacy per-tool release first
    const legacyTag = this.buildTag(toolName, version);
    if (await this.releaseExists(legacyTag)) {
      return `github.com/${this.repo}/releases/download/${legacyTag}/${filename}`;
    }
    // Could also search batch releases, but for simplicity we skip if not in legacy
    return null;
  }

  async releaseExists(tag: string): Promise<boolean> {
    try {
      execSync(`gh release view ${tag} --repo ${this.repo}`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        maxBuffer: 10 * 1024 * 1024,
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

    const response = execSync(cmd, { encoding: 'utf-8', timeout: 30000, maxBuffer: 10 * 1024 * 1024 });
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
      maxBuffer: 10 * 1024 * 1024,
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
      { encoding: 'utf-8', timeout: 300000, maxBuffer: 10 * 1024 * 1024 }
    );
  }

  private async createBatchRelease(
    tag: string,
    files: { path: string; filename: string }[],
    items: MirrorItem[]
  ): Promise<void> {
    const date = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const title = `Updates ${date}`;
    
    // Build release notes listing all tools
    const toolsList = items
      .filter(item => files.some(f => f.filename === this.applyVersion(item.filenameTemplate, item.version)))
      .map(item => `- ${item.toolName} ${item.version}`)
      .join('\n');
    const notes = `Mirrored for Nexus proxy access.\n\n**Included:**\n${toolsList}`;

    // Build file arguments for gh release create
    const fileArgs = files.map(f => `"${f.path}#${f.filename}"`).join(' ');

    execSync(
      `gh release create "${tag}" ${fileArgs} ` +
      `--repo ${this.repo} --title "${title}" --notes "${notes}"`,
      { encoding: 'utf-8', timeout: 600000, maxBuffer: 10 * 1024 * 1024 } // 10 minutes for multiple uploads
    );
  }
}
