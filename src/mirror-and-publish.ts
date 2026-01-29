// src/mirror-and-publish.ts
// Standalone script to mirror assets and publish CLI

import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { Storage } from './storage.js';
import { AssetMirror } from './asset-mirror.js';
import { CliPublisher } from './cli-publisher.js';
import { fetchVersion } from './fetchers/index.js';
import type { Config, DownloadsConfig, DownloadConfigUrl } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PKG_ROOT = join(__dirname, '..');

// Paths
const CONFIG_PATH = join(PKG_ROOT, 'config', 'tools.json');
const DOWNLOADS_PATH = join(PKG_ROOT, 'config', 'downloads.json');
const HOME_DIR = process.env.HOME || process.env.USERPROFILE || '/tmp';
const DATA_DIR = process.env.RELEASE_RADAR_DATA_DIR || join(HOME_DIR, '.release-radar');

// Ensure data directory exists
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

// Load configs
const configData: Config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
const downloadsConfig: DownloadsConfig = JSON.parse(readFileSync(DOWNLOADS_PATH, 'utf-8'));

// Initialize components
const storage = new Storage(join(DATA_DIR, 'versions.json'));
const assetMirror = new AssetMirror();
const USER_CLI_DIR = join(DATA_DIR, 'cli');
const cliPublisher = new CliPublisher(downloadsConfig, USER_CLI_DIR);

async function main() {
  console.log('🔍 Checking versions and mirroring assets...\n');

  const toolsToMirror = configData.tools.filter((tool) => {
    const downloadConfig = downloadsConfig[tool.name];
    return downloadConfig &&
           downloadConfig.type !== 'npm' &&
           'mirror' in downloadConfig &&
           downloadConfig.mirror;
  });

  console.log(`Found ${toolsToMirror.length} tools configured for mirroring`);

  for (const tool of toolsToMirror) {
    try {
      console.log(`\n📦 ${tool.name}`);

      // Fetch current version
      const version = await fetchVersion(tool);
      console.log(`  Version: ${version}`);

      // Store version
      const oldVersion = storage.getVersion(tool.name);
      if (oldVersion !== version) {
        storage.setVersion(tool.name, version);
        console.log(`  Updated from ${oldVersion || 'none'} to ${version}`);
      }

      // Mirror asset
      const downloadConfig = downloadsConfig[tool.name] as DownloadConfigUrl;
      const result = await assetMirror.mirror(
        tool.name,
        version,
        downloadConfig.mirror!,
        downloadConfig.filename
      );

      if (result.success && result.downloadUrl) {
        storage.setMirrorUrl(tool.name, result.downloadUrl);
        console.log(`  ✅ Mirrored: ${result.downloadUrl}`);
      } else {
        console.log(`  ⚠️ Mirror failed: ${result.error}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  ❌ Error: ${message}`);
    }
  }

  // Publish CLI
  console.log('\n\n📦 Publishing CLI...');
  const state = storage.load();
  const mirrorUrls = storage.getAllMirrorUrls();

  const result = await cliPublisher.publish(state.versions, mirrorUrls);

  if (result.success) {
    console.log(`✅ CLI published: v${result.version}`);
  } else {
    console.error(`❌ CLI publish failed: ${result.error}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
