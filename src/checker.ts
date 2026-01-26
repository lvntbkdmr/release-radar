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
