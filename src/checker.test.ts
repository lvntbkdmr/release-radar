// src/checker.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Checker } from './checker.js';
import type { ToolConfig } from './types.js';

vi.mock('./fetchers/index.js', () => ({
  fetchVersion: vi.fn()
}));

import { fetchVersion } from './fetchers/index.js';

describe('Checker', () => {
  let mockStorage: {
    getVersion: ReturnType<typeof vi.fn>;
    setVersion: ReturnType<typeof vi.fn>;
  };
  let mockNotifier: {
    sendBatchedUpdates: ReturnType<typeof vi.fn>;
    sendBatchedFailures: ReturnType<typeof vi.fn>;
  };
  let checker: Checker;
  let tools: ToolConfig[];

  beforeEach(() => {
    vi.clearAllMocks();

    mockStorage = {
      getVersion: vi.fn(),
      setVersion: vi.fn()
    };

    mockNotifier = {
      sendBatchedUpdates: vi.fn().mockResolvedValue(undefined),
      sendBatchedFailures: vi.fn().mockResolvedValue(undefined)
    };

    tools = [
      { name: 'Ninja', type: 'github', repo: 'ninja-build/ninja' },
      { name: 'Git', type: 'github', repo: 'git-for-windows/git' }
    ];

    checker = new Checker(tools, mockStorage as any, mockNotifier as any);
  });

  it('notifies on version change', async () => {
    mockStorage.getVersion.mockReturnValueOnce('1.11.1').mockReturnValueOnce('2.43.0');
    vi.mocked(fetchVersion)
      .mockResolvedValueOnce('1.12.0')
      .mockResolvedValueOnce('2.43.0');

    await checker.checkAll();

    expect(mockNotifier.sendBatchedUpdates).toHaveBeenCalledWith([
      { name: 'Ninja', oldVersion: '1.11.1', newVersion: '1.12.0' }
    ]);
    expect(mockStorage.setVersion).toHaveBeenCalledWith('Ninja', '1.12.0');
  });

  it('skips notification on first run (no stored version)', async () => {
    mockStorage.getVersion.mockReturnValue(null);
    vi.mocked(fetchVersion).mockResolvedValue('1.12.0');

    await checker.checkAll();

    expect(mockNotifier.sendBatchedUpdates).toHaveBeenCalledWith([]);
    expect(mockStorage.setVersion).toHaveBeenCalledTimes(2);
  });

  it('notifies on fetch failure', async () => {
    mockStorage.getVersion.mockReturnValue('1.11.1');
    vi.mocked(fetchVersion)
      .mockRejectedValueOnce(new Error('Timeout'))
      .mockResolvedValueOnce('2.43.0');

    await checker.checkAll();

    expect(mockNotifier.sendBatchedFailures).toHaveBeenCalledWith([
      { name: 'Ninja', error: 'Timeout' }
    ]);
  });

  it('does not notify when version unchanged', async () => {
    mockStorage.getVersion.mockReturnValue('1.12.0');
    vi.mocked(fetchVersion).mockResolvedValue('1.12.0');

    await checker.checkAll();

    expect(mockNotifier.sendBatchedUpdates).toHaveBeenCalledWith([]);
    expect(mockStorage.setVersion).not.toHaveBeenCalled();
  });
});
