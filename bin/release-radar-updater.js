#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { config } from 'dotenv';
import TelegramBot from 'node-telegram-bot-api';
import { startUpdater } from '../dist/updater.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from current working directory
const envPath = join(process.cwd(), '.env');
if (existsSync(envPath)) {
  config({ path: envPath });
}

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;
const PORT = parseInt(process.env.UPDATER_PORT || '9000', 10);

if (!BOT_TOKEN || !CHAT_ID) {
  console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID in .env');
  process.exit(1);
}

if (!WEBHOOK_SECRET) {
  console.error('Missing GITHUB_WEBHOOK_SECRET in .env');
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN);

startUpdater({
  port: PORT,
  webhookSecret: WEBHOOK_SECRET,
  telegramBot: bot,
  chatId: CHAT_ID
});
