// src/notifier.ts
import TelegramBot from 'node-telegram-bot-api';

export interface UpdateInfo {
  name: string;
  oldVersion: string;
  newVersion: string;
}

export interface FailureInfo {
  name: string;
  error: string;
}

export class Notifier {
  constructor(
    private bot: TelegramBot,
    private chatId: string
  ) {}

  async sendUpdate(name: string, oldVersion: string, newVersion: string): Promise<void> {
    await this.bot.sendMessage(this.chatId, `🔄 ${name}: ${oldVersion} → ${newVersion}`);
  }

  async sendBatchedUpdates(updates: UpdateInfo[]): Promise<void> {
    if (updates.length === 0) return;

    const message = updates
      .map(u => `🔄 ${u.name}: ${u.oldVersion} → ${u.newVersion}`)
      .join('\n');

    await this.bot.sendMessage(this.chatId, message);
  }

  async sendFailure(name: string, error: string): Promise<void> {
    await this.bot.sendMessage(this.chatId, `⚠️ Failed to check ${name}: ${error}`);
  }

  async sendBatchedFailures(failures: FailureInfo[]): Promise<void> {
    if (failures.length === 0) return;

    const message = failures
      .map(f => `⚠️ Failed to check ${f.name}: ${f.error}`)
      .join('\n');

    await this.bot.sendMessage(this.chatId, message);
  }
}
