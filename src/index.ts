// src/index.ts
import { config } from 'dotenv';
config();

import TelegramBot from 'node-telegram-bot-api';
import cron from 'node-cron';
import { readFileSync } from 'fs';
import { Storage } from './storage.js';
import { Notifier } from './notifier.js';
import { Checker } from './checker.js';
import type { Config } from './types.js';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!BOT_TOKEN || !CHAT_ID) {
  console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID environment variables');
  process.exit(1);
}

// Load config
const configData: Config = JSON.parse(
  readFileSync('./config/tools.json', 'utf-8')
);

// Initialize components
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const storage = new Storage('./data/versions.json');
const notifier = new Notifier(bot, CHAT_ID);
const checker = new Checker(configData.tools, storage, notifier);

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

// Schedule periodic checks
const cronExpression = `0 */${configData.checkIntervalHours} * * *`;
cron.schedule(cronExpression, async () => {
  console.log(`[${new Date().toISOString()}] Running scheduled check`);
  await checker.checkAll();
});

console.log(`ReleaseRadar started. Checking every ${configData.checkIntervalHours} hours.`);
console.log(`Tracking ${configData.tools.length} tools.`);
