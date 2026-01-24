// src/index.ts
import { config } from 'dotenv';
config();

import TelegramBot from 'node-telegram-bot-api';
import cron, { ScheduledTask } from 'node-cron';
import { readFileSync, writeFileSync } from 'fs';
import { Storage } from './storage.js';
import { Notifier } from './notifier.js';
import { Checker } from './checker.js';
import type { Config } from './types.js';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const CONFIG_PATH = './config/tools.json';

if (!BOT_TOKEN || !CHAT_ID) {
  console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID environment variables');
  process.exit(1);
}

// Load config
let configData: Config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));

// Initialize components
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const storage = new Storage('./data/versions.json');
const notifier = new Notifier(bot, CHAT_ID);
const checker = new Checker(configData.tools, storage, notifier);

// Track scheduled task for rescheduling
let scheduledTask: ScheduledTask | null = null;

function scheduleChecks(intervalHours: number): void {
  if (scheduledTask) {
    scheduledTask.stop();
  }
  const cronExpression = `0 */${intervalHours} * * *`;
  scheduledTask = cron.schedule(cronExpression, async () => {
    console.log(`[${new Date().toISOString()}] Running scheduled check`);
    await checker.checkAll();
  });
  console.log(`Scheduled checks every ${intervalHours} hours`);
}

// Bot commands
bot.onText(/\/check/, async (msg) => {
  if (msg.chat.id.toString() !== CHAT_ID) return;

  await bot.sendMessage(CHAT_ID, 'Checking for updates...');
  await checker.checkAll();
  await bot.sendMessage(CHAT_ID, 'Check complete.');
});

bot.onText(/\/status/, async (msg) => {
  if (msg.chat.id.toString() !== CHAT_ID) return;

  const state = storage.load();
  const lines = Object.entries(state.versions)
    .map(([name, version]) => `${name}: ${version}`)
    .sort();

  const message = lines.length > 0
    ? lines.join('\n')
    : 'No versions tracked yet. Run /check first.';

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

// Start scheduled checks
scheduleChecks(configData.checkIntervalHours);

console.log(`ReleaseRadar started. Checking every ${configData.checkIntervalHours} hours.`);
console.log(`Tracking ${configData.tools.length} tools.`);
