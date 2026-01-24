// src/index.ts
import { config } from 'dotenv';
config();

import TelegramBot from 'node-telegram-bot-api';
import cron, { ScheduledTask } from 'node-cron';
import { readFileSync, writeFileSync } from 'fs';
import { Storage } from './storage.js';
import { Notifier } from './notifier.js';
import { Checker } from './checker.js';
import { generateVersionsJson } from './versions-generator.js';
import type { Config, DownloadsConfig } from './types.js';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const CONFIG_PATH = './config/tools.json';

if (!BOT_TOKEN || !CHAT_ID) {
  console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID environment variables');
  process.exit(1);
}

// Load config
let configData: Config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));

const DOWNLOADS_PATH = './config/downloads.json';
let downloadsConfig: DownloadsConfig = {};
try {
  downloadsConfig = JSON.parse(readFileSync(DOWNLOADS_PATH, 'utf-8'));
} catch {
  console.log('No downloads.json found, CLI generation disabled');
}

// Initialize components
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const storage = new Storage('./data/versions.json');
const notifier = new Notifier(bot, CHAT_ID);
const checker = new Checker(configData.tools, storage, notifier);

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
    await checker.checkAll();
    nextCheckTime = calculateNextCheckTime(intervalHours);
  });
  console.log(`Scheduled checks every ${intervalHours} hours`);
}

// Bot commands
bot.onText(/\/check/, async (msg) => {
  if (msg.chat.id.toString() !== CHAT_ID) return;

  await bot.sendMessage(CHAT_ID, 'Checking for updates...');
  lastCheckTime = new Date();
  await checker.checkAll();
  nextCheckTime = calculateNextCheckTime(configData.checkIntervalHours);
  await bot.sendMessage(CHAT_ID, 'Check complete.');
});

bot.onText(/\/status/, async (msg) => {
  if (msg.chat.id.toString() !== CHAT_ID) return;

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

  await bot.sendMessage(CHAT_ID, message);
});

bot.onText(/\/interval$/, async (msg) => {
  if (msg.chat.id.toString() !== CHAT_ID) return;

  await bot.sendMessage(CHAT_ID, `Check interval: every ${configData.checkIntervalHours} hours`);
});

bot.onText(/\/setinterval(?:\s+(\d+))?/, async (msg, match) => {
  if (msg.chat.id.toString() !== CHAT_ID) return;

  const hoursStr = match?.[1];
  if (!hoursStr) {
    await bot.sendMessage(CHAT_ID, 'Usage: /setinterval <hours>\nExample: /setinterval 12');
    return;
  }

  const hours = parseInt(hoursStr, 10);
  if (hours < 1 || hours > 24) {
    await bot.sendMessage(CHAT_ID, 'Interval must be between 1 and 24 hours');
    return;
  }

  // Update config
  configData.checkIntervalHours = hours;
  writeFileSync(CONFIG_PATH, JSON.stringify(configData, null, 2));

  // Reschedule
  scheduleChecks(hours);

  await bot.sendMessage(CHAT_ID, `Check interval updated to every ${hours} hours`);
});

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

// Start scheduled checks
scheduleChecks(configData.checkIntervalHours);

console.log(`ReleaseRadar started. Checking every ${configData.checkIntervalHours} hours.`);
console.log(`Tracking ${configData.tools.length} tools.`);
