// src/checker.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Checker } from './checker.js';
import type { ToolConfig, DownloadsConfig } from './types.js';

vi.mock('./fetchers/index.js', () => ({
  fetchVersion: vi.fn()
}));

import { fetchVersion } from './fetchers/index.js';

describe('Checker', () => {
  let mockStorage: {
    getVersion: ReturnType<typeof vi.fn>;
    setVersion: ReturnType<typeof vi.fn>;
    setMirrorUrl: ReturnType<typeof vi.fn>;
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
      setVersion: vi.fn(),
      setMirrorUrl: vi.fn()
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

  it('returns hasUpdates true when updates found', async () => {
    mockStorage.getVersion.mockReturnValueOnce('1.11.1').mockReturnValueOnce('2.43.0');
    vi.mocked(fetchVersion)
      .mockResolvedValueOnce('1.12.0')
      .mockResolvedValueOnce('2.43.0');

    const result = await checker.checkAll();

    expect(result.hasUpdates).toBe(true);
    expect(result.updateCount).toBe(1);
  });

  it('returns hasUpdates false when no updates', async () => {
    mockStorage.getVersion.mockReturnValue('1.12.0');
    vi.mocked(fetchVersion).mockResolvedValue('1.12.0');

    const result = await checker.checkAll();

    expect(result.hasUpdates).toBe(false);
    expect(result.updateCount).toBe(0);
  });

  describe('Asset mirroring', () => {
    let mockAssetMirror: {
      mirror: ReturnType<typeof vi.fn>;
    };
    let downloadsConfig: DownloadsConfig;

    beforeEach(() => {
      mockAssetMirror = {
        mirror: vi.fn().mockResolvedValue({ success: true, downloadUrl: 'github.com/test/url' })
      };
      downloadsConfig = {
        'VSCode': {
          displayName: 'VS Code',
          downloadUrl: '{{MIRROR_URL}}',
          filename: 'VSCode-{{VERSION}}-win-x64.msi',
          mirror: { sourceUrl: 'https://update.code.visualstudio.com/latest/win32-x64/stable' }
        },
        'Ninja': {
          displayName: 'Ninja',
          downloadUrl: 'github.com/ninja/releases/{{VERSION}}/ninja.zip',
          filename: 'ninja-{{VERSION}}.zip'
          // No mirror config
        }
      };
    });

    it('mirrors asset when tool has mirror config and version updates', async () => {
      const vscodeTool: ToolConfig = { name: 'VSCode', type: 'custom', customFetcher: 'vscode' };
      const checkerWithMirror = new Checker(
        [vscodeTool],
        mockStorage as any,
        mockNotifier as any,
        mockAssetMirror as any,
        downloadsConfig
      );

      mockStorage.getVersion.mockReturnValue('1.95.0');
      vi.mocked(fetchVersion).mockResolvedValue('1.96.0');

      await checkerWithMirror.checkAll();

      expect(mockAssetMirror.mirror).toHaveBeenCalledWith(
        'VSCode',
        '1.96.0',
        { sourceUrl: 'https://update.code.visualstudio.com/latest/win32-x64/stable' },
        'VSCode-{{VERSION}}-win-x64.msi'
      );
      expect(mockStorage.setMirrorUrl).toHaveBeenCalledWith('VSCode', 'github.com/test/url');
    });

    it('does not mirror when tool has no mirror config', async () => {
      const ninjaTool: ToolConfig = { name: 'Ninja', type: 'github', repo: 'ninja-build/ninja' };
      const checkerWithMirror = new Checker(
        [ninjaTool],
        mockStorage as any,
        mockNotifier as any,
        mockAssetMirror as any,
        downloadsConfig
      );

      mockStorage.getVersion.mockReturnValue('1.11.0');
      vi.mocked(fetchVersion).mockResolvedValue('1.12.0');

      await checkerWithMirror.checkAll();

      expect(mockAssetMirror.mirror).not.toHaveBeenCalled();
    });

    it('does not mirror when version unchanged', async () => {
      const vscodeTool: ToolConfig = { name: 'VSCode', type: 'custom', customFetcher: 'vscode' };
      const checkerWithMirror = new Checker(
        [vscodeTool],
        mockStorage as any,
        mockNotifier as any,
        mockAssetMirror as any,
        downloadsConfig
      );

      mockStorage.getVersion.mockReturnValue('1.96.0');
      vi.mocked(fetchVersion).mockResolvedValue('1.96.0');

      await checkerWithMirror.checkAll();

      expect(mockAssetMirror.mirror).not.toHaveBeenCalled();
    });

    it('continues if mirror fails', async () => {
      const vscodeTool: ToolConfig = { name: 'VSCode', type: 'custom', customFetcher: 'vscode' };
      mockAssetMirror.mirror.mockResolvedValue({ success: false, error: 'network error' });

      const checkerWithMirror = new Checker(
        [vscodeTool],
        mockStorage as any,
        mockNotifier as any,
        mockAssetMirror as any,
        downloadsConfig
      );

      mockStorage.getVersion.mockReturnValue('1.95.0');
      vi.mocked(fetchVersion).mockResolvedValue('1.96.0');

      await checkerWithMirror.checkAll();

      expect(mockStorage.setVersion).toHaveBeenCalledWith('VSCode', '1.96.0');
      expect(mockStorage.setMirrorUrl).not.toHaveBeenCalled();
    });
  });
});
