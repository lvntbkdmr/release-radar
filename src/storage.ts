// src/storage.ts
import { readFileSync, writeFileSync, renameSync, existsSync } from 'fs';

export interface StorageState {
  lastCheck: string | null;
  versions: Record<string, string>;
}

export class Storage {
  private state: StorageState | null = null;

  constructor(private filePath: string) {}

  private ensureLoaded(): StorageState {
    if (!this.state) {
      this.state = this.load();
    }
    return this.state;
  }

  load(): StorageState {
    if (!existsSync(this.filePath)) {
      return { lastCheck: null, versions: {} };
    }
    const content = readFileSync(this.filePath, 'utf-8');
    return JSON.parse(content);
  }

  save(state: StorageState): void {
    const tempPath = `${this.filePath}.tmp`;
    writeFileSync(tempPath, JSON.stringify(state, null, 2));
    renameSync(tempPath, this.filePath);
  }

  getVersion(toolName: string): string | null {
    const state = this.ensureLoaded();
    return state.versions[toolName] ?? null;
  }

  setVersion(toolName: string, version: string): void {
    const state = this.ensureLoaded();
    state.versions[toolName] = version;
    state.lastCheck = new Date().toISOString();
    this.save(state);
  }
}
