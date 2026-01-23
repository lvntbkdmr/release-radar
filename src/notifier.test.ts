// src/notifier.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Notifier } from './notifier.js';

describe('Notifier', () => {
  let mockBot: { sendMessage: ReturnType<typeof vi.fn> };
  let notifier: Notifier;

  beforeEach(() => {
    mockBot = { sendMessage: vi.fn().mockResolvedValue({}) };
    notifier = new Notifier(mockBot as any, '123456789');
  });

  it('sends update notification with correct format', async () => {
    await notifier.sendUpdate('Ninja', '1.11.1', '1.12.0');

    expect(mockBot.sendMessage).toHaveBeenCalledWith(
      '123456789',
      '🔄 Ninja: 1.11.1 → 1.12.0'
    );
  });

  it('sends batched updates as single message', async () => {
    const updates = [
      { name: 'Ninja', oldVersion: '1.11.1', newVersion: '1.12.0' },
      { name: 'Git', oldVersion: '2.43.0', newVersion: '2.44.0' }
    ];

    await notifier.sendBatchedUpdates(updates);

    expect(mockBot.sendMessage).toHaveBeenCalledTimes(1);
    expect(mockBot.sendMessage).toHaveBeenCalledWith(
      '123456789',
      '🔄 Ninja: 1.11.1 → 1.12.0\n🔄 Git: 2.43.0 → 2.44.0'
    );
  });

  it('sends failure notification', async () => {
    await notifier.sendFailure('CMake', 'Request timeout');

    expect(mockBot.sendMessage).toHaveBeenCalledWith(
      '123456789',
      '⚠️ Failed to check CMake: Request timeout'
    );
  });

  it('sends batched failures as single message', async () => {
    const failures = [
      { name: 'CMake', error: 'Timeout' },
      { name: 'VSCode', error: 'Connection refused' }
    ];

    await notifier.sendBatchedFailures(failures);

    expect(mockBot.sendMessage).toHaveBeenCalledTimes(1);
    expect(mockBot.sendMessage).toHaveBeenCalledWith(
      '123456789',
      '⚠️ Failed to check CMake: Timeout\n⚠️ Failed to check VSCode: Connection refused'
    );
  });
});
