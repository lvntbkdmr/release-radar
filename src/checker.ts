// src/checker.ts
import type { ToolConfig, DownloadsConfig, DownloadConfigUrl } from './types.js';
import type { Storage } from './storage.js';
import type { Notifier, UpdateInfo, FailureInfo } from './notifier.js';
import type { AssetMirror, MirrorItem } from './asset-mirror.js';
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
    const mirrorItems: MirrorItem[] = [];

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

          // Collect mirror items for batch processing
          const mirrorItem = this.getMirrorItem(tool.name, newVersion);
          if (mirrorItem) {
            mirrorItems.push(mirrorItem);
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push({ name: tool.name, error: message });
      }
    }

    // Batch mirror all updated assets
    if (mirrorItems.length > 0 && this.assetMirror) {
      const batchResult = await this.assetMirror.mirrorBatch(mirrorItems);
      
      // Store mirror URLs for successful items
      for (const [toolName, result] of batchResult.results) {
        if (result.success && result.downloadUrl) {
          this.storage.setMirrorUrl(toolName, result.downloadUrl);
        }
      }
    }

    await this.notifier.sendBatchedUpdates(updates);
    await this.notifier.sendBatchedFailures(failures);

    return { hasUpdates: updates.length > 0, updateCount: updates.length };
  }

  private getMirrorItem(toolName: string, version: string): MirrorItem | null {
    if (!this.downloadsConfig) return null;

    const downloadConfig = this.downloadsConfig[toolName];
    if (!downloadConfig || downloadConfig.type === 'npm') return null;

    const urlConfig = downloadConfig as DownloadConfigUrl;
    if (!urlConfig.mirror) return null;

    return {
      toolName,
      version,
      config: urlConfig.mirror,
      filenameTemplate: urlConfig.filename,
    };
  }
}
