#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync, copyFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = join(__dirname, '..');

// Ensure config directory exists in current working directory
const configDir = join(process.cwd(), 'config');
const dataDir = join(process.cwd(), 'data');

if (!existsSync(configDir)) {
  mkdirSync(configDir, { recursive: true });
  // Copy default config
  const defaultConfig = join(packageRoot, 'config', 'tools.json');
  if (existsSync(defaultConfig)) {
    copyFileSync(defaultConfig, join(configDir, 'tools.json'));
    console.log('Created config/tools.json with default configuration');
  }
}

if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

// Check for .env file
const envFile = join(process.cwd(), '.env');
if (!existsSync(envFile)) {
  const envExample = join(packageRoot, '.env.example');
  if (existsSync(envExample)) {
    copyFileSync(envExample, envFile);
    console.log('Created .env file - please edit with your Telegram credentials');
    console.log('  TELEGRAM_BOT_TOKEN=your_bot_token_here');
    console.log('  TELEGRAM_CHAT_ID=your_chat_id_here');
    process.exit(1);
  }
}

// Run the main application
import('../dist/index.js');
