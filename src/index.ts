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
import type { Config, DownloadsConfig } from './types.js';

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
const checker = new Checker(configData.tools, storage, notifier);
const cliPublisher = new CliPublisher(downloadsConfig, USER_CLI_DIR);

// Track scheduled task for rescheduling
let scheduledTask: ScheduledTask | null = null;
let lastCheckTime: Date | null = null;
let nextCheckTime: Date | null = null;

function calculateNextCheckTime(intervalHours: number): Date {
  const now = new Date();
  const next = new Date(now);
  next.setMinutes(0, 0, 0);
  next.setHours(Math.ceil(now.getHours() / intervalHours) * intervalHours);
  if (next <= now) {
    next.setHours(next.getHours() + intervalHours);
  }
  return next;
}

function scheduleChecks(intervalHours: number): void {
  if (scheduledTask) {
    scheduledTask.stop();
  }
  nextCheckTime = calculateNextCheckTime(intervalHours);
  const cronExpression = `0 */${intervalHours} * * *`;
  scheduledTask = cron.schedule(cronExpression, async () => {
    console.log(`[${new Date().toISOString()}] Running scheduled check`);
    lastCheckTime = new Date();
    const result = await checker.checkAll();
    nextCheckTime = calculateNextCheckTime(intervalHours);

    // Auto-publish CLI if updates were detected
    if (result.hasUpdates && cliPublisher.isConfigured()) {
      const state = storage.load();
      const publishResult = await cliPublisher.publish(state.versions);
      if (publishResult.success) {
        await bot.sendMessage(validatedChatId, `📦 CLI published: v${publishResult.version}`);
      }
    }
  });
  console.log(`Scheduled checks every ${intervalHours} hours`);
}

// Bot commands
bot.onText(/\/check/, async (msg) => {
  if (msg.chat.id.toString() !== validatedChatId) return;

  await bot.sendMessage(validatedChatId, 'Checking for updates...');
  lastCheckTime = new Date();
  const result = await checker.checkAll();
  nextCheckTime = calculateNextCheckTime(configData.checkIntervalHours);

  // Auto-publish CLI if updates were detected
  if (result.hasUpdates && cliPublisher.isConfigured()) {
    const state = storage.load();
    const publishResult = await cliPublisher.publish(state.versions);
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

  // Update config
  configData.checkIntervalHours = hours;
  writeFileSync(CONFIG_PATH, JSON.stringify(configData, null, 2));

  // Reschedule
  scheduleChecks(hours);

  await bot.sendMessage(validatedChatId, `Check interval updated to every ${hours} hours`);
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
  const preview = formatCliPreview(state.versions);
  await bot.sendMessage(validatedChatId, `📦 Publishing CLI...\n\n${preview}`);

  const result = await cliPublisher.publish(state.versions);

  if (result.success) {
    await bot.sendMessage(validatedChatId, `✅ CLI published: v${result.version}`);
  } else {
    await bot.sendMessage(validatedChatId, `❌ CLI publish failed: ${result.error}`);
  }
});

// Start scheduled checks
scheduleChecks(configData.checkIntervalHours);

console.log(`ReleaseRadar started. Checking every ${configData.checkIntervalHours} hours.`);
console.log(`Tracking ${configData.tools.length} tools.`);
