import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface DownloadRecord {
  version: string;
  downloadedAt: string;
  filename: string;
}

export interface DownloadedState {
  [toolName: string]: DownloadRecord;
}

export class DownloadTracker {
  private filePath: string;

  constructor(baseDir?: string) {
    const dir = baseDir ?? join(homedir(), '.release-radar-cli');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    this.filePath = join(dir, 'downloaded.json');
  }

  getAll(): DownloadedState {
    if (!existsSync(this.filePath)) {
      return {};
    }
    return JSON.parse(readFileSync(this.filePath, 'utf-8'));
  }

  getDownloadedVersion(toolName: string): string | null {
    const all = this.getAll();
    return all[toolName]?.version ?? null;
  }

  recordDownload(toolName: string, version: string, filename: string): void {
    const all = this.getAll();
    all[toolName] = {
      version,
      downloadedAt: new Date().toISOString(),
      filename,
    };
    writeFileSync(this.filePath, JSON.stringify(all, null, 2));
  }
}
