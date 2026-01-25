// src/cli-publisher.ts
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { generateVersionsJson } from './versions-generator.js';
import type { DownloadsConfig } from './types.js';

export interface PublishResult {
  success: boolean;
  version?: string;
  error?: string;
}

function getLatestNpmVersion(packageName: string): string | null {
  try {
    const result = execSync(`npm view ${packageName} version`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 15000,
    });
    return result.trim();
  } catch {
    return null;
  }
}

function bumpPatchVersion(version: string): string {
  const parts = version.split('.').map(Number);
  parts[2]++;
  return parts.join('.');
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

      // Write to CLI package
      const cliVersionsPath = `${this.cliPath}/versions.json`;
      writeFileSync(cliVersionsPath, JSON.stringify(versionsJson, null, 2));

      // Get latest version from npm (fallback to local if npm unreachable)
      const pkgPath = `${this.cliPath}/package.json`;
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      const packageName = pkg.name;

      console.log('[CliPublisher] Checking latest version on npm...');
      const latestNpmVersion = getLatestNpmVersion(packageName);
      const baseVersion = latestNpmVersion || pkg.version;
      console.log(`[CliPublisher] Base version: ${baseVersion} (from ${latestNpmVersion ? 'npm' : 'local'})`);

      // Bump patch version from the latest
      const newVersion = bumpPatchVersion(baseVersion);
      pkg.version = newVersion;
      writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

      // Install dependencies (including devDependencies for TypeScript)
      console.log('[CliPublisher] Installing dependencies...');
      execSync('npm install', { cwd: this.cliPath, stdio: 'pipe' });

      // Build CLI
      console.log('[CliPublisher] Building...');
      execSync('npm run build', { cwd: this.cliPath, stdio: 'pipe' });

      // Publish to npm
      console.log('[CliPublisher] Publishing...');
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
