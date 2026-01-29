// src/storage.ts
import { readFileSync, writeFileSync, renameSync, existsSync } from 'fs';

export interface StorageState {
  lastCheck: string | null;
  versions: Record<string, string>;
  mirrorUrls?: Record<string, string>;
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
      this.state = { lastCheck: null, versions: {} };
    } else {
      const content = readFileSync(this.filePath, 'utf-8');
      this.state = JSON.parse(content);
    }
    return this.state!;
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

  getMirrorUrl(toolName: string): string | null {
    const state = this.ensureLoaded();
    return state.mirrorUrls?.[toolName] ?? null;
  }

  setMirrorUrl(toolName: string, url: string): void {
    const state = this.ensureLoaded();
    if (!state.mirrorUrls) {
      state.mirrorUrls = {};
    }
    state.mirrorUrls[toolName] = url;
    this.save(state);
  }

  getAllMirrorUrls(): Record<string, string> {
    const state = this.ensureLoaded();
    return state.mirrorUrls ?? {};
  }

  deleteVersion(toolName: string): boolean {
    const state = this.ensureLoaded();
    if (toolName in state.versions) {
      delete state.versions[toolName];
      if (state.mirrorUrls && toolName in state.mirrorUrls) {
        delete state.mirrorUrls[toolName];
      }
      this.save(state);
      return true;
    }
    return false;
  }

  getAllVersions(): Record<string, string> {
    const state = this.ensureLoaded();
    return state.versions;
  }
}
