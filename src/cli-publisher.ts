// src/cli-publisher.ts
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'fs';
import { generateVersionsJson } from './versions-generator.js';
import type { DownloadsConfig } from './types.js';

export interface PublishResult {
  success: boolean;
  version?: string;
  error?: string;
}

export class CliPublisher {
  constructor(
    private downloadsConfig: DownloadsConfig,
    private cliPath: string = './cli'
  ) {}

  isConfigured(): boolean {
    return Object.keys(this.downloadsConfig).length > 0 && existsSync(this.cliPath);
  }

  async publish(versions: Record<string, string>): Promise<PublishResult> {
    if (!this.isConfigured()) {
      return { success: false, error: 'CLI publisher not configured' };
    }

    try {
      // Generate versions.json
      const versionsJson = generateVersionsJson(versions, this.downloadsConfig);

      // Write to data/ for reference
      writeFileSync('./data/cli-versions.json', JSON.stringify(versionsJson, null, 2));

      // Copy to CLI package
      const cliVersionsPath = `${this.cliPath}/versions.json`;
      writeFileSync(cliVersionsPath, JSON.stringify(versionsJson, null, 2));

      // Read current CLI version
      const pkgPath = `${this.cliPath}/package.json`;
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      const currentVersion = pkg.version;

      // Bump patch version
      const versionParts = currentVersion.split('.').map(Number);
      versionParts[2]++;
      const newVersion = versionParts.join('.');
      pkg.version = newVersion;
      writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

      // Build CLI
      execSync('npm run build', { cwd: this.cliPath, stdio: 'pipe' });

      // Publish to npm
      execSync('npm publish --access public', { cwd: this.cliPath, stdio: 'pipe' });

      console.log(`[CliPublisher] Published @lvnt/release-radar-cli v${newVersion}`);
      return { success: true, version: newVersion };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[CliPublisher] Failed to publish: ${message}`);
      return { success: false, error: message };
    }
  }
}
