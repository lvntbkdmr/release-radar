# release-radar-cli Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a companion CLI tool that enables downloading monitored tools on an intranet through a corporate Nexus proxy.

**Architecture:** Two-part system: (1) ReleaseRadar generates versions.json with download URLs and publishes it as part of an npm package, (2) release-radar-cli provides interactive TUI for selecting and downloading tools via wget.

**Tech Stack:** Node.js, TypeScript, inquirer (interactive prompts), chalk (terminal styling), child_process (wget execution)

---

## Part 1: ReleaseRadar Changes

### Task 1: Add Download Config Types

**Files:**
- Modify: `src/types.ts`

**Step 1: Add download config types to types.ts**

Add after line 16 in `src/types.ts`:

```typescript
export interface DownloadConfig {
  displayName: string;
  downloadUrl: string;  // Template with {{VERSION}} placeholder
  filename: string;     // Template with {{VERSION}} placeholder
}

export interface DownloadsConfig {
  [toolName: string]: DownloadConfig;
}

export interface VersionsJsonTool {
  name: string;
  displayName: string;
  version: string;
  publishedAt: string;
  downloadUrl: string;  // With {{NEXUS_URL}} placeholder
  filename: string;
}

export interface VersionsJson {
  generatedAt: string;
  tools: VersionsJsonTool[];
}
```

**Step 2: Commit**

```bash
git add src/types.ts
git commit -m "feat: add download config types for CLI"
```

---

### Task 2: Create downloads.json Config File

**Files:**
- Create: `config/downloads.json`

**Step 1: Create downloads.json with sample entries**

```json
{
  "Ninja": {
    "displayName": "Ninja",
    "downloadUrl": "github.com/ninja-build/ninja/releases/download/v{{VERSION}}/ninja-linux.zip",
    "filename": "ninja-{{VERSION}}-linux.zip"
  },
  "CMake": {
    "displayName": "CMake",
    "downloadUrl": "github.com/Kitware/CMake/releases/download/v{{VERSION}}/cmake-{{VERSION}}-linux-x86_64.tar.gz",
    "filename": "cmake-{{VERSION}}-linux-x86_64.tar.gz"
  },
  "Git": {
    "displayName": "Git for Windows",
    "downloadUrl": "github.com/git-for-windows/git/releases/download/v{{VERSION}}.windows.1/Git-{{VERSION}}-64-bit.exe",
    "filename": "Git-{{VERSION}}-64-bit.exe"
  }
}
```

**Step 2: Commit**

```bash
git add config/downloads.json
git commit -m "feat: add downloads.json config for CLI download URLs"
```

---

### Task 3: Create Versions JSON Generator

**Files:**
- Create: `src/versions-generator.ts`
- Create: `src/versions-generator.test.ts`

**Step 1: Write the failing test**

Create `src/versions-generator.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { generateVersionsJson } from './versions-generator.js';
import type { DownloadsConfig } from './types.js';

describe('generateVersionsJson', () => {
  it('merges version data with download config', () => {
    const versions: Record<string, string> = {
      'Ninja': '1.12.0',
      'CMake': '3.28.0',
    };

    const downloads: DownloadsConfig = {
      'Ninja': {
        displayName: 'Ninja Build',
        downloadUrl: 'github.com/ninja-build/ninja/releases/download/v{{VERSION}}/ninja-linux.zip',
        filename: 'ninja-{{VERSION}}-linux.zip',
      },
      'CMake': {
        displayName: 'CMake',
        downloadUrl: 'github.com/Kitware/CMake/releases/download/v{{VERSION}}/cmake-{{VERSION}}.tar.gz',
        filename: 'cmake-{{VERSION}}.tar.gz',
      },
    };

    const result = generateVersionsJson(versions, downloads);

    expect(result.tools).toHaveLength(2);
    expect(result.generatedAt).toBeDefined();

    const ninja = result.tools.find(t => t.name === 'Ninja');
    expect(ninja).toBeDefined();
    expect(ninja!.displayName).toBe('Ninja Build');
    expect(ninja!.version).toBe('1.12.0');
    expect(ninja!.downloadUrl).toBe('{{NEXUS_URL}}/github.com/ninja-build/ninja/releases/download/v1.12.0/ninja-linux.zip');
    expect(ninja!.filename).toBe('ninja-1.12.0-linux.zip');
  });

  it('only includes tools that have download config', () => {
    const versions: Record<string, string> = {
      'Ninja': '1.12.0',
      'UnknownTool': '1.0.0',
    };

    const downloads: DownloadsConfig = {
      'Ninja': {
        displayName: 'Ninja',
        downloadUrl: 'github.com/ninja/releases/{{VERSION}}/ninja.zip',
        filename: 'ninja-{{VERSION}}.zip',
      },
    };

    const result = generateVersionsJson(versions, downloads);

    expect(result.tools).toHaveLength(1);
    expect(result.tools[0].name).toBe('Ninja');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/versions-generator.test.ts`
Expected: FAIL with "Cannot find module './versions-generator.js'"

**Step 3: Write minimal implementation**

Create `src/versions-generator.ts`:

```typescript
import type { DownloadsConfig, VersionsJson, VersionsJsonTool } from './types.js';

export function generateVersionsJson(
  versions: Record<string, string>,
  downloads: DownloadsConfig
): VersionsJson {
  const tools: VersionsJsonTool[] = [];

  for (const [toolName, version] of Object.entries(versions)) {
    const downloadConfig = downloads[toolName];
    if (!downloadConfig) continue;

    const downloadUrl = '{{NEXUS_URL}}/' +
      downloadConfig.downloadUrl.replace(/\{\{VERSION\}\}/g, version);
    const filename = downloadConfig.filename.replace(/\{\{VERSION\}\}/g, version);

    tools.push({
      name: toolName,
      displayName: downloadConfig.displayName,
      version,
      publishedAt: new Date().toISOString(),
      downloadUrl,
      filename,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    tools,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/versions-generator.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/versions-generator.ts src/versions-generator.test.ts
git commit -m "feat: add versions.json generator"
```

---

### Task 4: Add Generate Command to ReleaseRadar

**Files:**
- Modify: `src/index.ts`

**Step 1: Add /generate command to bot**

Add imports at top of `src/index.ts`:

```typescript
import { generateVersionsJson } from './versions-generator.js';
import type { DownloadsConfig } from './types.js';
```

Add after line 23 (after loading configData):

```typescript
const DOWNLOADS_PATH = './config/downloads.json';
let downloadsConfig: DownloadsConfig = {};
try {
  downloadsConfig = JSON.parse(readFileSync(DOWNLOADS_PATH, 'utf-8'));
} catch {
  console.log('No downloads.json found, CLI generation disabled');
}
```

Add new bot command after the /setinterval command (after line 136):

```typescript
bot.onText(/\/generate/, async (msg) => {
  if (msg.chat.id.toString() !== CHAT_ID) return;

  if (Object.keys(downloadsConfig).length === 0) {
    await bot.sendMessage(CHAT_ID, 'No downloads.json configured.');
    return;
  }

  const state = storage.load();
  const versionsJson = generateVersionsJson(state.versions, downloadsConfig);

  const outputPath = './data/versions.json';
  writeFileSync(outputPath, JSON.stringify(versionsJson, null, 2));

  await bot.sendMessage(
    CHAT_ID,
    `Generated versions.json with ${versionsJson.tools.length} tools.\nPath: ${outputPath}`
  );
});
```

**Step 2: Commit**

```bash
git add src/index.ts
git commit -m "feat: add /generate command for CLI versions.json"
```

---

## Part 2: release-radar-cli Package

### Task 5: Initialize CLI Package Structure

**Files:**
- Create: `cli/package.json`
- Create: `cli/tsconfig.json`
- Create: `cli/bin/release-radar-cli.js`
- Create: `cli/src/index.ts`

**Step 1: Create cli directory and package.json**

```bash
mkdir -p cli/bin cli/src
```

Create `cli/package.json`:

```json
{
  "name": "@lvnt/release-radar-cli",
  "version": "0.1.0",
  "description": "Interactive CLI for downloading tools through Nexus proxy",
  "main": "dist/index.js",
  "bin": {
    "release-radar-cli": "bin/release-radar-cli.js"
  },
  "type": "module",
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/index.ts",
    "test": "vitest run",
    "prepublishOnly": "npm run build"
  },
  "files": [
    "dist",
    "bin",
    "versions.json"
  ],
  "keywords": [
    "release",
    "download",
    "nexus",
    "cli"
  ],
  "author": "lvnt",
  "license": "ISC",
  "dependencies": {
    "chalk": "^5.3.0",
    "inquirer": "^9.2.12"
  },
  "devDependencies": {
    "@types/inquirer": "^9.0.7",
    "@types/node": "^20.10.0",
    "tsx": "^4.7.0",
    "typescript": "^5.3.0",
    "vitest": "^1.1.0"
  }
}
```

**Step 2: Create tsconfig.json**

Create `cli/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 3: Create bin entry point**

Create `cli/bin/release-radar-cli.js`:

```javascript
#!/usr/bin/env node
import '../dist/index.js';
```

**Step 4: Create placeholder index.ts**

Create `cli/src/index.ts`:

```typescript
console.log('release-radar-cli placeholder');
```

**Step 5: Commit**

```bash
git add cli/
git commit -m "feat: initialize release-radar-cli package structure"
```

---

### Task 6: Implement Config Manager

**Files:**
- Create: `cli/src/config.ts`
- Create: `cli/src/config.test.ts`

**Step 1: Write the failing test**

Create `cli/src/config.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConfigManager } from './config.js';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('ConfigManager', () => {
  let tempDir: string;
  let configManager: ConfigManager;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'cli-test-'));
    configManager = new ConfigManager(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true });
  });

  it('returns false for isConfigured when no config exists', () => {
    expect(configManager.isConfigured()).toBe(false);
  });

  it('saves and loads config correctly', () => {
    configManager.save({
      nexusUrl: 'http://nexus.local',
      downloadDir: '/downloads',
    });

    expect(configManager.isConfigured()).toBe(true);

    const loaded = configManager.load();
    expect(loaded.nexusUrl).toBe('http://nexus.local');
    expect(loaded.downloadDir).toBe('/downloads');
  });

  it('creates config directory if it does not exist', () => {
    const configPath = join(tempDir, 'config.json');
    expect(existsSync(configPath)).toBe(false);

    configManager.save({
      nexusUrl: 'http://nexus.local',
      downloadDir: '/downloads',
    });

    expect(existsSync(configPath)).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd cli && npm install && npm test -- src/config.test.ts`
Expected: FAIL with "Cannot find module './config.js'"

**Step 3: Write minimal implementation**

Create `cli/src/config.ts`:

```typescript
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
```

**Step 4: Run test to verify it passes**

Run: `cd cli && npm test -- src/config.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add cli/src/config.ts cli/src/config.test.ts
git commit -m "feat(cli): add config manager"
```

---

### Task 7: Implement Download Tracker

**Files:**
- Create: `cli/src/tracker.ts`
- Create: `cli/src/tracker.test.ts`

**Step 1: Write the failing test**

Create `cli/src/tracker.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DownloadTracker } from './tracker.js';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('DownloadTracker', () => {
  let tempDir: string;
  let tracker: DownloadTracker;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'tracker-test-'));
    tracker = new DownloadTracker(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true });
  });

  it('returns null for untracked tool', () => {
    expect(tracker.getDownloadedVersion('unknown')).toBeNull();
  });

  it('tracks downloaded version', () => {
    tracker.recordDownload('Ninja', '1.12.0', 'ninja-1.12.0.zip');

    const version = tracker.getDownloadedVersion('Ninja');
    expect(version).toBe('1.12.0');
  });

  it('returns all downloaded tools', () => {
    tracker.recordDownload('Ninja', '1.12.0', 'ninja.zip');
    tracker.recordDownload('CMake', '3.28.0', 'cmake.tar.gz');

    const all = tracker.getAll();
    expect(Object.keys(all)).toHaveLength(2);
    expect(all['Ninja'].version).toBe('1.12.0');
    expect(all['CMake'].version).toBe('3.28.0');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd cli && npm test -- src/tracker.test.ts`
Expected: FAIL with "Cannot find module './tracker.js'"

**Step 3: Write minimal implementation**

Create `cli/src/tracker.ts`:

```typescript
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
```

**Step 4: Run test to verify it passes**

Run: `cd cli && npm test -- src/tracker.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add cli/src/tracker.ts cli/src/tracker.test.ts
git commit -m "feat(cli): add download tracker"
```

---

### Task 8: Implement Versions Loader

**Files:**
- Create: `cli/src/versions.ts`
- Create: `cli/src/types.ts`

**Step 1: Create types file**

Create `cli/src/types.ts`:

```typescript
export interface VersionsJsonTool {
  name: string;
  displayName: string;
  version: string;
  publishedAt: string;
  downloadUrl: string;
  filename: string;
}

export interface VersionsJson {
  generatedAt: string;
  tools: VersionsJsonTool[];
}
```

**Step 2: Create versions loader**

Create `cli/src/versions.ts`:

```typescript
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type { VersionsJson } from './types.js';

export function loadVersions(): VersionsJson {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  // In dist/, versions.json is at package root
  const versionsPath = join(__dirname, '..', 'versions.json');
  const content = readFileSync(versionsPath, 'utf-8');
  return JSON.parse(content);
}
```

**Step 3: Commit**

```bash
git add cli/src/types.ts cli/src/versions.ts
git commit -m "feat(cli): add types and versions loader"
```

---

### Task 9: Implement Downloader

**Files:**
- Create: `cli/src/downloader.ts`
- Create: `cli/src/downloader.test.ts`

**Step 1: Write the failing test**

Create `cli/src/downloader.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildWgetCommand, replaceNexusUrl } from './downloader.js';

describe('downloader', () => {
  describe('replaceNexusUrl', () => {
    it('replaces {{NEXUS_URL}} placeholder', () => {
      const url = '{{NEXUS_URL}}/github.com/ninja/v1.0/ninja.zip';
      const result = replaceNexusUrl(url, 'http://nexus.local');
      expect(result).toBe('http://nexus.local/github.com/ninja/v1.0/ninja.zip');
    });
  });

  describe('buildWgetCommand', () => {
    it('builds correct wget command', () => {
      const cmd = buildWgetCommand(
        'http://nexus.local/file.zip',
        '/downloads/file.zip'
      );
      expect(cmd).toBe('wget -O "/downloads/file.zip" "http://nexus.local/file.zip"');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd cli && npm test -- src/downloader.test.ts`
Expected: FAIL with "Cannot find module './downloader.js'"

**Step 3: Write minimal implementation**

Create `cli/src/downloader.ts`:

```typescript
import { execSync } from 'child_process';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

export function replaceNexusUrl(url: string, nexusUrl: string): string {
  return url.replace('{{NEXUS_URL}}', nexusUrl);
}

export function buildWgetCommand(url: string, outputPath: string): string {
  return `wget -O "${outputPath}" "${url}"`;
}

export interface DownloadResult {
  success: boolean;
  error?: string;
}

export function downloadFile(
  url: string,
  downloadDir: string,
  filename: string,
  nexusUrl: string
): DownloadResult {
  const resolvedUrl = replaceNexusUrl(url, nexusUrl);

  if (!existsSync(downloadDir)) {
    mkdirSync(downloadDir, { recursive: true });
  }

  const outputPath = join(downloadDir, filename);
  const command = buildWgetCommand(resolvedUrl, outputPath);

  try {
    execSync(command, { stdio: 'inherit' });
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd cli && npm test -- src/downloader.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add cli/src/downloader.ts cli/src/downloader.test.ts
git commit -m "feat(cli): add downloader with wget execution"
```

---

### Task 10: Implement Auto-Updater

**Files:**
- Create: `cli/src/updater.ts`

**Step 1: Create updater module**

Create `cli/src/updater.ts`:

```typescript
import { execSync, spawn } from 'child_process';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

function getCurrentVersion(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const pkgPath = join(__dirname, '..', 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  return pkg.version;
}

function getLatestVersion(): string | null {
  try {
    const result = execSync('npm view @lvnt/release-radar-cli version', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.trim();
  } catch {
    return null;
  }
}

export async function checkAndUpdate(): Promise<boolean> {
  const current = getCurrentVersion();
  const latest = getLatestVersion();

  if (!latest) {
    // Can't reach npm registry, continue with current
    return false;
  }

  if (current === latest) {
    return false;
  }

  console.log(`Updating from ${current} to ${latest}...`);

  try {
    execSync('npm update -g @lvnt/release-radar-cli', {
      stdio: 'inherit',
    });
    console.log('Update complete. Restarting...\n');

    // Restart self
    const child = spawn(process.argv[0], process.argv.slice(1), {
      detached: true,
      stdio: 'inherit',
    });
    child.unref();
    process.exit(0);
  } catch (error) {
    console.error('Update failed, continuing with current version');
    return false;
  }
}
```

**Step 2: Commit**

```bash
git add cli/src/updater.ts
git commit -m "feat(cli): add auto-updater with restart"
```

---

### Task 11: Implement Interactive UI

**Files:**
- Create: `cli/src/ui.ts`

**Step 1: Create UI module**

Create `cli/src/ui.ts`:

```typescript
import inquirer from 'inquirer';
import chalk from 'chalk';
import type { VersionsJsonTool } from './types.js';
import type { DownloadedState } from './tracker.js';
import type { CliConfig } from './config.js';

export async function promptSetup(): Promise<CliConfig> {
  console.log(chalk.bold('\nWelcome to release-radar-cli!\n'));
  console.log("Let's configure your settings.\n");

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'nexusUrl',
      message: 'Enter your Nexus proxy base URL:',
      validate: (input: string) => {
        if (!input.trim()) return 'URL is required';
        if (!input.startsWith('http')) return 'URL must start with http:// or https://';
        return true;
      },
    },
    {
      type: 'input',
      name: 'downloadDir',
      message: 'Enter download directory:',
      default: '~/downloads/tools',
      validate: (input: string) => input.trim() ? true : 'Directory is required',
    },
  ]);

  return {
    nexusUrl: answers.nexusUrl.replace(/\/$/, ''), // Remove trailing slash
    downloadDir: answers.downloadDir.replace('~', process.env.HOME || ''),
  };
}

interface ToolChoice {
  name: string;
  displayName: string;
  version: string;
  downloadUrl: string;
  filename: string;
  status: 'new' | 'update' | 'current';
  downloadedVersion: string | null;
}

function getStatus(
  tool: VersionsJsonTool,
  downloaded: DownloadedState
): { status: 'new' | 'update' | 'current'; downloadedVersion: string | null } {
  const record = downloaded[tool.name];
  if (!record) {
    return { status: 'new', downloadedVersion: null };
  }
  if (record.version !== tool.version) {
    return { status: 'update', downloadedVersion: record.version };
  }
  return { status: 'current', downloadedVersion: record.version };
}

export async function promptToolSelection(
  tools: VersionsJsonTool[],
  downloaded: DownloadedState,
  generatedAt: string
): Promise<ToolChoice[]> {
  const choices: ToolChoice[] = tools.map((tool) => {
    const { status, downloadedVersion } = getStatus(tool, downloaded);
    return {
      ...tool,
      status,
      downloadedVersion,
    };
  });

  console.log(chalk.bold(`\nrelease-radar-cli`));
  console.log(chalk.gray(`Last updated: ${new Date(generatedAt).toLocaleString()}\n`));

  // Display table
  console.log(chalk.bold('  Tool               Latest       Downloaded   Status'));
  console.log(chalk.gray('─'.repeat(60)));

  choices.forEach((choice) => {
    const downloadedStr = choice.downloadedVersion ?? '-';
    let statusStr: string;
    switch (choice.status) {
      case 'new':
        statusStr = chalk.blue('NEW');
        break;
      case 'update':
        statusStr = chalk.yellow('UPDATE');
        break;
      case 'current':
        statusStr = chalk.green('✓');
        break;
    }
    console.log(
      `  ${choice.displayName.padEnd(18)} ${choice.version.padEnd(12)} ${downloadedStr.padEnd(12)} ${statusStr}`
    );
  });

  console.log('');

  const { selected } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selected',
      message: 'Select tools to download:',
      choices: choices.map((choice) => ({
        name: `${choice.displayName} ${choice.version}`,
        value: choice,
        checked: choice.status !== 'current',
      })),
    },
  ]);

  return selected;
}
```

**Step 2: Commit**

```bash
git add cli/src/ui.ts
git commit -m "feat(cli): add interactive UI with inquirer"
```

---

### Task 12: Implement Main Entry Point

**Files:**
- Modify: `cli/src/index.ts`

**Step 1: Implement main function**

Replace `cli/src/index.ts`:

```typescript
import chalk from 'chalk';
import { ConfigManager } from './config.js';
import { DownloadTracker } from './tracker.js';
import { loadVersions } from './versions.js';
import { checkAndUpdate } from './updater.js';
import { downloadFile } from './downloader.js';
import { promptSetup, promptToolSelection } from './ui.js';

async function main(): Promise<void> {
  const configManager = new ConfigManager();
  const tracker = new DownloadTracker();

  // First run setup
  if (!configManager.isConfigured()) {
    const config = await promptSetup();
    configManager.save(config);
    console.log(chalk.green('\nConfiguration saved!\n'));
  }

  // Check for updates and restart if needed
  await checkAndUpdate();

  // Load data
  const config = configManager.load();
  const versions = loadVersions();
  const downloaded = tracker.getAll();

  // Show interactive menu
  const selected = await promptToolSelection(
    versions.tools,
    downloaded,
    versions.generatedAt
  );

  if (selected.length === 0) {
    console.log(chalk.gray('\nNo tools selected. Exiting.'));
    return;
  }

  // Download selected tools
  console.log('');
  for (const tool of selected) {
    console.log(chalk.bold(`Downloading ${tool.displayName} ${tool.version}...`));

    const result = downloadFile(
      tool.downloadUrl,
      config.downloadDir,
      tool.filename,
      config.nexusUrl
    );

    if (result.success) {
      tracker.recordDownload(tool.name, tool.version, tool.filename);
      console.log(chalk.green(`  Saved to ${config.downloadDir}/${tool.filename} ✓\n`));
    } else {
      console.log(chalk.red(`  Failed: ${result.error}\n`));
    }
  }

  console.log(chalk.green('Done!'));
}

main().catch((error) => {
  console.error(chalk.red('Error:'), error.message);
  process.exit(1);
});
```

**Step 2: Commit**

```bash
git add cli/src/index.ts
git commit -m "feat(cli): implement main entry point"
```

---

### Task 13: Add Status and Config Commands

**Files:**
- Modify: `cli/src/index.ts`

**Step 1: Add command argument handling**

Replace `cli/src/index.ts` with full implementation:

```typescript
import chalk from 'chalk';
import { ConfigManager } from './config.js';
import { DownloadTracker } from './tracker.js';
import { loadVersions } from './versions.js';
import { checkAndUpdate } from './updater.js';
import { downloadFile } from './downloader.js';
import { promptSetup, promptToolSelection } from './ui.js';

async function showStatus(): Promise<void> {
  const tracker = new DownloadTracker();
  const versions = loadVersions();
  const downloaded = tracker.getAll();

  console.log(chalk.bold('\nTool Status:\n'));

  for (const tool of versions.tools) {
    const record = downloaded[tool.name];
    const downloadedVersion = record?.version ?? '-';

    let status: string;
    if (!record) {
      status = chalk.blue('NEW');
    } else if (record.version !== tool.version) {
      status = chalk.yellow('UPDATE');
    } else {
      status = chalk.green('✓');
    }

    console.log(`  ${tool.displayName.padEnd(20)} ${tool.version.padEnd(12)} ${downloadedVersion.padEnd(12)} ${status}`);
  }
  console.log('');
}

async function runConfig(): Promise<void> {
  const configManager = new ConfigManager();
  const config = await promptSetup();
  configManager.save(config);
  console.log(chalk.green('\nConfiguration saved!'));
}

async function runInteractive(): Promise<void> {
  const configManager = new ConfigManager();
  const tracker = new DownloadTracker();

  // First run setup
  if (!configManager.isConfigured()) {
    const config = await promptSetup();
    configManager.save(config);
    console.log(chalk.green('\nConfiguration saved!\n'));
  }

  // Check for updates and restart if needed
  await checkAndUpdate();

  // Load data
  const config = configManager.load();
  const versions = loadVersions();
  const downloaded = tracker.getAll();

  // Show interactive menu
  const selected = await promptToolSelection(
    versions.tools,
    downloaded,
    versions.generatedAt
  );

  if (selected.length === 0) {
    console.log(chalk.gray('\nNo tools selected. Exiting.'));
    return;
  }

  // Download selected tools
  console.log('');
  for (const tool of selected) {
    console.log(chalk.bold(`Downloading ${tool.displayName} ${tool.version}...`));

    const result = downloadFile(
      tool.downloadUrl,
      config.downloadDir,
      tool.filename,
      config.nexusUrl
    );

    if (result.success) {
      tracker.recordDownload(tool.name, tool.version, tool.filename);
      console.log(chalk.green(`  Saved to ${config.downloadDir}/${tool.filename} ✓\n`));
    } else {
      console.log(chalk.red(`  Failed: ${result.error}\n`));
    }
  }

  console.log(chalk.green('Done!'));
}

async function main(): Promise<void> {
  const command = process.argv[2];

  switch (command) {
    case 'status':
      await showStatus();
      break;
    case 'config':
      await runConfig();
      break;
    default:
      await runInteractive();
      break;
  }
}

main().catch((error) => {
  console.error(chalk.red('Error:'), error.message);
  process.exit(1);
});
```

**Step 2: Commit**

```bash
git add cli/src/index.ts
git commit -m "feat(cli): add status and config commands"
```

---

### Task 14: Create Sample versions.json for Testing

**Files:**
- Create: `cli/versions.json`

**Step 1: Create sample versions.json**

Create `cli/versions.json`:

```json
{
  "generatedAt": "2026-01-24T10:00:00Z",
  "tools": [
    {
      "name": "Ninja",
      "displayName": "Ninja",
      "version": "1.12.0",
      "publishedAt": "2026-01-20T00:00:00Z",
      "downloadUrl": "{{NEXUS_URL}}/github.com/ninja-build/ninja/releases/download/v1.12.0/ninja-linux.zip",
      "filename": "ninja-1.12.0-linux.zip"
    },
    {
      "name": "CMake",
      "displayName": "CMake",
      "version": "3.28.1",
      "publishedAt": "2026-01-18T00:00:00Z",
      "downloadUrl": "{{NEXUS_URL}}/github.com/Kitware/CMake/releases/download/v3.28.1/cmake-3.28.1-linux-x86_64.tar.gz",
      "filename": "cmake-3.28.1-linux-x86_64.tar.gz"
    }
  ]
}
```

**Step 2: Commit**

```bash
git add cli/versions.json
git commit -m "feat(cli): add sample versions.json for testing"
```

---

### Task 15: Install Dependencies and Test Build

**Step 1: Install dependencies**

```bash
cd cli && npm install
```

**Step 2: Run tests**

```bash
cd cli && npm test
```

Expected: All tests pass

**Step 3: Build the CLI**

```bash
cd cli && npm run build
```

Expected: TypeScript compiles without errors

**Step 4: Commit lock file**

```bash
git add cli/package-lock.json
git commit -m "chore(cli): add package-lock.json"
```

---

### Task 16: Update Root .gitignore

**Files:**
- Modify: `.gitignore`

**Step 1: Add CLI ignores**

Add to `.gitignore`:

```
# CLI
cli/node_modules/
cli/dist/
```

**Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: add CLI directories to gitignore"
```

---

### Task 17: Add CLI Publish Script to ReleaseRadar

**Files:**
- Create: `scripts/publish-cli.sh`

**Step 1: Create publish script**

Create `scripts/publish-cli.sh`:

```bash
#!/bin/bash
set -e

# Generate versions.json from ReleaseRadar data
echo "Generating versions.json..."
cp data/versions.json cli/versions.json

# Build and publish CLI
cd cli
npm version patch
npm run build
npm publish --access public

echo "CLI published successfully!"
```

**Step 2: Make executable**

```bash
chmod +x scripts/publish-cli.sh
```

**Step 3: Commit**

```bash
git add scripts/publish-cli.sh
git commit -m "feat: add CLI publish script"
```

---

## Summary Checklist

- [ ] Task 1: Add download config types
- [ ] Task 2: Create downloads.json config
- [ ] Task 3: Create versions JSON generator
- [ ] Task 4: Add /generate command
- [ ] Task 5: Initialize CLI package structure
- [ ] Task 6: Implement config manager
- [ ] Task 7: Implement download tracker
- [ ] Task 8: Implement versions loader
- [ ] Task 9: Implement downloader
- [ ] Task 10: Implement auto-updater
- [ ] Task 11: Implement interactive UI
- [ ] Task 12: Implement main entry point
- [ ] Task 13: Add status and config commands
- [ ] Task 14: Create sample versions.json
- [ ] Task 15: Install and test build
- [ ] Task 16: Update .gitignore
- [ ] Task 17: Add CLI publish script
