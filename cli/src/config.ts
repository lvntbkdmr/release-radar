import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface CliConfig {
  nexusUrl: string;
  downloadDir: string;
}

export class ConfigManager {
  private configPath: string;

  constructor(baseDir?: string) {
    const dir = baseDir ?? join(homedir(), '.release-radar-cli');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    this.configPath = join(dir, 'config.json');
  }

  isConfigured(): boolean {
    return existsSync(this.configPath);
  }

  load(): CliConfig {
    const content = readFileSync(this.configPath, 'utf-8');
    return JSON.parse(content);
  }

  save(config: CliConfig): void {
    writeFileSync(this.configPath, JSON.stringify(config, null, 2));
  }
}
