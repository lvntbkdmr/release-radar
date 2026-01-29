// src/index.ts
import { config } from 'dotenv';
config();

import TelegramBot from 'node-telegram-bot-api';
import cron, { ScheduledTask } from 'node-cron';
import { readFileSync, writeFileSync, existsSync, mkdirSync, cpSync, rmSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Storage } from './storage.js';
import { Notifier } from './notifier.js';
import { Checker } from './checker.js';
import { generateVersionsJson } from './versions-generator.js';
import { CliPublisher } from './cli-publisher.js';
import { AssetMirror } from './asset-mirror.js';
import type { Config, DownloadsConfig, ScheduleMode } from './types.js';

// Get package directory for resolving config paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PKG_ROOT = join(__dirname, '..');  // dist/../ = package root

console.log(`ReleaseRadar package root: ${PKG_ROOT}`);

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const CONFIG_PATH = join(PKG_ROOT, 'config', 'tools.json');

if (!BOT_TOKEN || !CHAT_ID) {
  console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID environment variables');
  process.exit(1);
}

// Type-safe constants after validation
const validatedChatId = CHAT_ID as string;

// Load config
console.log(`Loading config from: ${CONFIG_PATH}`);
if (!existsSync(CONFIG_PATH)) {
  console.error(`Config file not found: ${CONFIG_PATH}`);
  process.exit(1);
}
let configData: Config;
try {
  configData = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
} catch (error) {
  console.error(`Failed to parse config: ${error}`);
  process.exit(1);
}

const DOWNLOADS_PATH = join(PKG_ROOT, 'config', 'downloads.json');
console.log(`Loading downloads config from: ${DOWNLOADS_PATH}`);
let downloadsConfig: DownloadsConfig = {};
try {
  downloadsConfig = JSON.parse(readFileSync(DOWNLOADS_PATH, 'utf-8'));
  console.log(`Loaded ${Object.keys(downloadsConfig).length} download configs`);
} catch {
  console.log('No downloads.json found, CLI generation disabled');
}

// Data directory - use ~/.release-radar for user-writable storage
const HOME_DIR = process.env.HOME || process.env.USERPROFILE || '/tmp';
const DATA_DIR = process.env.RELEASE_RADAR_DATA_DIR || join(HOME_DIR, '.release-radar');
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}
console.log(`Data directory: ${DATA_DIR}`);

// Log package version for debugging
const pkgJson = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf-8'));
console.log(`ReleaseRadar version: ${pkgJson.version}`);

// Sync cli/ source from package to user directory for publishing
// Always sync to ensure updates from the package are reflected
const PKG_CLI_DIR = join(PKG_ROOT, 'cli');
const USER_CLI_DIR = join(DATA_DIR, 'cli');
console.log(`Syncing CLI source from ${PKG_CLI_DIR} to ${USER_CLI_DIR}...`);

if (existsSync(PKG_CLI_DIR)) {
  // Sync source files (excluding node_modules and dist which are generated)
  const filesToSync = ['src', 'bin', 'package.json', 'tsconfig.json', 'README.md'];
  let syncedCount = 0;

  for (const file of filesToSync) {
    const srcPath = join(PKG_CLI_DIR, file);
    const destPath = join(USER_CLI_DIR, file);

    if (existsSync(srcPath)) {
      try {
        // Remove existing destination first to ensure clean copy
        if (existsSync(destPath)) {
          rmSync(destPath, { recursive: true, force: true });
        }
        // Ensure parent directory exists
        mkdirSync(USER_CLI_DIR, { recursive: true });
        // Copy fresh
        cpSync(srcPath, destPath, { recursive: true });
        syncedCount++;
      } catch (err) {
        console.error(`Failed to sync ${file}: ${err}`);
      }
    } else {
      console.log(`CLI source file not found: ${srcPath}`);
    }
  }
  console.log(`CLI source synced: ${syncedCount}/${filesToSync.length} files`);
} else {
  console.error(`CLI source directory not found: ${PKG_CLI_DIR}`);
}

// Initialize components
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const storage = new Storage(join(DATA_DIR, 'versions.json'));
const notifier = new Notifier(bot, validatedChatId);
const cliPublisher = new CliPublisher(downloadsConfig, USER_CLI_DIR);
const assetMirror = new AssetMirror();
const checker = new Checker(configData.tools, storage, notifier, assetMirror, downloadsConfig);

// Track scheduled task for rescheduling
let scheduledTask: ScheduledTask | null = null;
let lastCheckTime: Date | null = null;
let nextCheckTime: Date | null = null;

// Parse HH:MM time string
function parseTime(timeStr: string): { hour: number; minute: number } | null {
  const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function calculateNextCheckTimeInterval(intervalHours: number): Date {
  const now = new Date();
  const next = new Date(now);
  next.setMinutes(0, 0, 0);
  next.setHours(Math.ceil(now.getHours() / intervalHours) * intervalHours);
  if (next <= now) {
    next.setHours(next.getHours() + intervalHours);
  }
  return next;
}

function calculateNextCheckTimeDaily(timeStr: string): Date {
  const parsed = parseTime(timeStr);
  if (!parsed) {
    // Fallback to 6am if invalid
    return calculateNextCheckTimeDaily('06:00');
  }
  
  const now = new Date();
  const next = new Date(now);
  next.setHours(parsed.hour, parsed.minute, 0, 0);
  
  // If the time has passed today, schedule for tomorrow
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

function calculateNextCheckTime(): Date {
  const mode = configData.scheduleMode || 'interval';
  if (mode === 'daily') {
    return calculateNextCheckTimeDaily(configData.dailyCheckTime || '06:00');
  }
  return calculateNextCheckTimeInterval(configData.checkIntervalHours);
}

async function runScheduledCheck(): Promise<void> {
  console.log(`[${new Date().toISOString()}] Running scheduled check`);
  lastCheckTime = new Date();
  const result = await checker.checkAll();
  nextCheckTime = calculateNextCheckTime();

  // Auto-publish CLI if updates were detected
  if (result.hasUpdates && cliPublisher.isConfigured()) {
    const state = storage.load();
    const mirrorUrls = storage.getAllMirrorUrls();
    const publishResult = await cliPublisher.publish(state.versions, mirrorUrls);
    if (publishResult.success) {
      await bot.sendMessage(validatedChatId, `📦 CLI published: v${publishResult.version}`);
    }
  }
}

function scheduleChecks(): void {
  if (scheduledTask) {
    scheduledTask.stop();
  }

  const mode = configData.scheduleMode || 'interval';
  let cronExpression: string;

  if (mode === 'daily') {
    const timeStr = configData.dailyCheckTime || '06:00';
    const parsed = parseTime(timeStr);
    const hour = parsed?.hour ?? 6;
    const minute = parsed?.minute ?? 0;
    cronExpression = `${minute} ${hour} * * *`;
    console.log(`Scheduled daily check at ${timeStr}`);
  } else {
    const intervalHours = configData.checkIntervalHours;
    cronExpression = `0 */${intervalHours} * * *`;
    console.log(`Scheduled checks every ${intervalHours} hours`);
  }

  nextCheckTime = calculateNextCheckTime();
  scheduledTask = cron.schedule(cronExpression, runScheduledCheck);
}

function saveConfig(): void {
  writeFileSync(CONFIG_PATH, JSON.stringify(configData, null, 2));
}

// Bot commands
bot.onText(/\/check/, async (msg) => {
  if (msg.chat.id.toString() !== validatedChatId) return;

  await bot.sendMessage(validatedChatId, 'Checking for updates...');
  lastCheckTime = new Date();
  const result = await checker.checkAll();
  nextCheckTime = calculateNextCheckTime();

  // Auto-publish CLI if updates were detected
  if (result.hasUpdates && cliPublisher.isConfigured()) {
    const state = storage.load();
    const mirrorUrls = storage.getAllMirrorUrls();
    const publishResult = await cliPublisher.publish(state.versions, mirrorUrls);
    if (publishResult.success) {
      await bot.sendMessage(validatedChatId, `📦 CLI published: v${publishResult.version}`);
    } else {
      await bot.sendMessage(validatedChatId, `⚠️ CLI publish failed: ${publishResult.error}`);
    }
  }

  await bot.sendMessage(validatedChatId, 'Check complete.');
});

bot.onText(/\/status/, async (msg) => {
  if (msg.chat.id.toString() !== validatedChatId) return;

  const state = storage.load();
  const lines = Object.entries(state.versions)
    .map(([name, version]) => `${name}: ${version}`)
    .sort();

  let message = lines.length > 0
    ? lines.join('\n')
    : 'No versions tracked yet. Run /check first.';

  // Add timing info
  message += '\n\n---';
  if (lastCheckTime) {
    const ago = Math.round((Date.now() - lastCheckTime.getTime()) / 60000);
    message += `\nLast check: ${ago} min ago`;
  } else {
    message += '\nLast check: not yet';
  }
  if (nextCheckTime) {
    const mins = Math.round((nextCheckTime.getTime() - Date.now()) / 60000);
    if (mins > 0) {
      const hours = Math.floor(mins / 60);
      const remainingMins = mins % 60;
      message += `\nNext check: in ${hours > 0 ? hours + 'h ' : ''}${remainingMins}m`;
    } else {
      message += '\nNext check: soon';
    }
  }

  await bot.sendMessage(validatedChatId, message);
});

bot.onText(/\/interval$/, async (msg) => {
  if (msg.chat.id.toString() !== validatedChatId) return;

  await bot.sendMessage(validatedChatId, `Check interval: every ${configData.checkIntervalHours} hours`);
});

bot.onText(/\/setinterval(?:\s+(\d+))?/, async (msg, match) => {
  if (msg.chat.id.toString() !== validatedChatId) return;

  const hoursStr = match?.[1];
  if (!hoursStr) {
    await bot.sendMessage(validatedChatId, 'Usage: /setinterval <hours>\nExample: /setinterval 12');
    return;
  }

  const hours = parseInt(hoursStr, 10);
  if (hours < 1 || hours > 24) {
    await bot.sendMessage(validatedChatId, 'Interval must be between 1 and 24 hours');
    return;
  }

  // Update config (also switch to interval mode)
  configData.checkIntervalHours = hours;
  configData.scheduleMode = 'interval';
  saveConfig();

  // Reschedule
  scheduleChecks();

  await bot.sendMessage(validatedChatId, `Check interval updated to every ${hours} hours (interval mode)`);
});

// /schedule - show current schedule configuration
bot.onText(/\/schedule$/, async (msg) => {
  if (msg.chat.id.toString() !== validatedChatId) return;

  const mode = configData.scheduleMode || 'interval';
  let message: string;

  if (mode === 'daily') {
    const time = configData.dailyCheckTime || '06:00';
    message = `📅 Schedule: Daily at ${time}`;
  } else {
    message = `🔄 Schedule: Every ${configData.checkIntervalHours} hours`;
  }

  // Add next check info
  if (nextCheckTime) {
    const mins = Math.round((nextCheckTime.getTime() - Date.now()) / 60000);
    if (mins > 0) {
      const hours = Math.floor(mins / 60);
      const remainingMins = mins % 60;
      message += `\nNext check: in ${hours > 0 ? hours + 'h ' : ''}${remainingMins}m`;
    } else {
      message += '\nNext check: soon';
    }
  }

  await bot.sendMessage(validatedChatId, message);
});

// /settime <HH:MM> - set daily check time
bot.onText(/\/settime(?:\s+(.+))?/, async (msg, match) => {
  if (msg.chat.id.toString() !== validatedChatId) return;

  const timeStr = match?.[1]?.trim();
  if (!timeStr) {
    await bot.sendMessage(validatedChatId, 'Usage: /settime <HH:MM>\nExample: /settime 06:00');
    return;
  }

  const parsed = parseTime(timeStr);
  if (!parsed) {
    await bot.sendMessage(validatedChatId, 'Invalid time format. Use HH:MM (24-hour), e.g., 06:00 or 18:30');
    return;
  }

  // Update config and switch to daily mode
  configData.dailyCheckTime = timeStr;
  configData.scheduleMode = 'daily';
  saveConfig();

  // Reschedule
  scheduleChecks();

  await bot.sendMessage(validatedChatId, `✅ Daily check scheduled at ${timeStr}`);
});

// /setmode <daily|interval> - switch schedule mode
bot.onText(/\/setmode(?:\s+(.+))?/, async (msg, match) => {
  if (msg.chat.id.toString() !== validatedChatId) return;

  const modeArg = match?.[1]?.trim().toLowerCase();
  if (!modeArg || !['daily', 'interval'].includes(modeArg)) {
    await bot.sendMessage(validatedChatId, 'Usage: /setmode <daily|interval>\n\n• daily - check once per day at configured time\n• interval - check every N hours');
    return;
  }

  const newMode = modeArg as 'daily' | 'interval';
  configData.scheduleMode = newMode;
  saveConfig();

  // Reschedule
  scheduleChecks();

  if (newMode === 'daily') {
    const time = configData.dailyCheckTime || '06:00';
    await bot.sendMessage(validatedChatId, `📅 Switched to daily mode. Checking at ${time}\n\nUse /settime to change the time.`);
  } else {
    await bot.sendMessage(validatedChatId, `🔄 Switched to interval mode. Checking every ${configData.checkIntervalHours} hours\n\nUse /setinterval to change the interval.`);
  }
});

bot.onText(/\/generate/, async (msg) => {
  if (msg.chat.id.toString() !== validatedChatId) return;

  if (Object.keys(downloadsConfig).length === 0) {
    await bot.sendMessage(validatedChatId, 'No downloads.json configured.');
    return;
  }

  const state = storage.load();
  const versionsJson = generateVersionsJson(state.versions, downloadsConfig);

  const outputPath = join(DATA_DIR, 'cli-versions.json');
  writeFileSync(outputPath, JSON.stringify(versionsJson, null, 2));

  await bot.sendMessage(
    CHAT_ID,
    `Generated versions.json with ${versionsJson.tools.length} tools.\nPath: ${outputPath}`
  );
});

// Helper to format CLI preview
function formatCliPreview(versions: Record<string, string>): string {
  const versionsJson = generateVersionsJson(versions, downloadsConfig);
  if (versionsJson.tools.length === 0) {
    return 'No tools configured in downloads.json';
  }

  const lines = versionsJson.tools.map((tool) => {
    const typeLabel = tool.type === 'npm' ? '(npm)' : '';
    return `• ${tool.displayName}: ${tool.version} ${typeLabel}`;
  });

  return `CLI will include ${versionsJson.tools.length} tools:\n${lines.join('\n')}`;
}

bot.onText(/\/clipreview/, async (msg) => {
  if (msg.chat.id.toString() !== validatedChatId) return;

  if (!cliPublisher.isConfigured()) {
    await bot.sendMessage(validatedChatId, 'CLI publisher not configured. Check downloads.json and cli/ directory.');
    return;
  }

  const state = storage.load();
  const preview = formatCliPreview(state.versions);
  await bot.sendMessage(validatedChatId, `📋 CLI Preview\n\n${preview}\n\nUse /publishcli to publish.`);
});

bot.onText(/\/publishcli/, async (msg) => {
  if (msg.chat.id.toString() !== validatedChatId) return;

  if (!cliPublisher.isConfigured()) {
    await bot.sendMessage(validatedChatId, 'CLI publisher not configured. Check downloads.json and cli/ directory.');
    return;
  }

  const state = storage.load();
  const mirrorUrls = storage.getAllMirrorUrls();
  const preview = formatCliPreview(state.versions);
  await bot.sendMessage(validatedChatId, `📦 Publishing CLI...\n\n${preview}`);

  const result = await cliPublisher.publish(state.versions, mirrorUrls);

  if (result.success) {
    await bot.sendMessage(validatedChatId, `✅ CLI published: v${result.version}`);
  } else {
    await bot.sendMessage(validatedChatId, `❌ CLI publish failed: ${result.error}`);
  }
});

bot.onText(/\/mirrorall/, async (msg) => {
  if (msg.chat.id.toString() !== validatedChatId) return;

  // Find all tools that need mirroring (have mirror config and use {{MIRROR_URL}})
  const mirrorItems: Array<{
    toolName: string;
    version: string;
    config: import('./types.js').MirrorConfig;
    filenameTemplate: string;
  }> = [];

  for (const [toolName, config] of Object.entries(downloadsConfig)) {
    if (config.type === 'npm' || !('mirror' in config) || !config.mirror) continue;
    if (config.downloadUrl !== '{{MIRROR_URL}}') continue;

    const version = storage.getVersion(toolName);
    if (!version) {
      console.log(`[mirrorall] Skipping ${toolName}: no tracked version`);
      continue;
    }

    mirrorItems.push({
      toolName,
      version,
      config: config.mirror,
      filenameTemplate: config.filename,
    });
  }

  if (mirrorItems.length === 0) {
    await bot.sendMessage(validatedChatId, 'No tools configured for mirroring (or no tracked versions).');
    return;
  }

  const toolList = mirrorItems.map(i => `• ${i.toolName} v${i.version}`).join('\n');
  await bot.sendMessage(validatedChatId, `🔄 Mirroring ${mirrorItems.length} tools...\n\n${toolList}`);

  const result = await assetMirror.mirrorBatch(mirrorItems);

  // Update storage with successful mirrors
  let successCount = 0;
  let failCount = 0;
  const failures: string[] = [];

  for (const [toolName, mirrorResult] of result.results) {
    if (mirrorResult.success && mirrorResult.downloadUrl) {
      storage.setMirrorUrl(toolName, mirrorResult.downloadUrl);
      successCount++;
    } else {
      failCount++;
      failures.push(`• ${toolName}: ${mirrorResult.error || 'Unknown error'}`);
    }
  }

  let message = `✅ Mirrored ${successCount}/${mirrorItems.length} tools`;
  if (result.tag) {
    message += `\nRelease: ${result.tag}`;
  }
  if (failCount > 0) {
    message += `\n\n❌ ${failCount} failed:\n${failures.join('\n')}`;
  }

  await bot.sendMessage(validatedChatId, message);
});

bot.onText(/\/mirror(?:\s+(.+))?/, async (msg, match) => {
  if (msg.chat.id.toString() !== validatedChatId) return;

  const args = match?.[1]?.trim();
  if (!args) {
    await bot.sendMessage(validatedChatId, 'Usage: /mirror <toolname> [version] [--force]\nExample: /mirror VSCode\nExample: /mirror VSCode --force\nExample: /mirror "Claude Code VSCode" 2.1.9\n\n--force: Delete existing release and re-mirror');
    return;
  }

  // Check for --force flag and remove it from args
  const force = /\s*--force\b/.test(args) || /\s+-f\b/.test(args);
  const argsWithoutForce = args
    .replace(/\s*--force\b/g, '')
    .replace(/\s+-f\b/g, '')
    .trim();

  // Parse tool name and optional version
  let toolName: string;
  let version: string | null = null;

  const quoteMatch = argsWithoutForce.match(/^"([^"]+)"(?:\s+(\S+))?$/);
  if (quoteMatch) {
    toolName = quoteMatch[1];
    version = quoteMatch[2] || null;
  } else {
    const parts = argsWithoutForce.split(/\s+/).filter(p => p.length > 0);
    toolName = parts[0];
    version = parts[1] || null;
  }

  // Get download config for this tool
  const downloadConfig = downloadsConfig[toolName];
  if (!downloadConfig || downloadConfig.type === 'npm' || !('mirror' in downloadConfig) || !downloadConfig.mirror) {
    await bot.sendMessage(validatedChatId, `Tool "${toolName}" is not configured for mirroring.`);
    return;
  }

  // Get version if not provided
  if (!version) {
    version = storage.getVersion(toolName);
  }

  if (!version) {
    await bot.sendMessage(validatedChatId, `No version specified and no tracked version found for "${toolName}".`);
    return;
  }

  const forceLabel = force ? ' (force)' : '';
  await bot.sendMessage(validatedChatId, `Mirroring ${toolName} v${version}${forceLabel}...`);

  const result = await assetMirror.mirror(toolName, version, downloadConfig.mirror, downloadConfig.filename, force);

  if (result.success) {
    storage.setMirrorUrl(toolName, result.downloadUrl!);
    await bot.sendMessage(validatedChatId, `✅ Mirrored successfully\nURL: ${result.downloadUrl}`);
  } else {
    await bot.sendMessage(validatedChatId, `❌ Mirror failed: ${result.error}`);
  }
});

bot.onText(/\/resetversion(?:\s+(.+))?/, async (msg, match) => {
  if (msg.chat.id.toString() !== validatedChatId) return;

  const toolName = match?.[1]?.trim();
  if (!toolName) {
    await bot.sendMessage(validatedChatId, 'Usage: /resetversion <toolname>\nExample: /resetversion Python\n\nThis clears the stored version so the next /check will re-fetch it.');
    return;
  }

  const deleted = storage.deleteVersion(toolName);
  if (deleted) {
    await bot.sendMessage(validatedChatId, `✅ Reset "${toolName}". Run /check to fetch the current version.`);
  } else {
    await bot.sendMessage(validatedChatId, `Tool "${toolName}" not found in storage.`);
  }
});

bot.onText(/\/resetall/, async (msg) => {
  if (msg.chat.id.toString() !== validatedChatId) return;

  const versions = storage.getAllVersions();
  const toolNames = Object.keys(versions);

  if (toolNames.length === 0) {
    await bot.sendMessage(validatedChatId, 'No versions stored.');
    return;
  }

  for (const toolName of toolNames) {
    storage.deleteVersion(toolName);
  }

  await bot.sendMessage(validatedChatId, `✅ Reset ${toolNames.length} tools. Run /check to re-fetch all versions.`);
});

// Start scheduled checks
scheduleChecks();

const mode = configData.scheduleMode || 'interval';
if (mode === 'daily') {
  console.log(`ReleaseRadar started. Daily check at ${configData.dailyCheckTime || '06:00'}.`);
} else {
  console.log(`ReleaseRadar started. Checking every ${configData.checkIntervalHours} hours.`);
}
console.log(`Tracking ${configData.tools.length} tools.`);
