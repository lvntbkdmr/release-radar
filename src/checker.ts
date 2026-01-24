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
