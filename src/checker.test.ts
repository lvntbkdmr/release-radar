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

  describe('VSIX mirroring', () => {
    let mockVsixMirror: {
      mirror: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
      mockVsixMirror = {
        mirror: vi.fn().mockResolvedValue({ success: true, downloadUrl: 'github.com/test/url.vsix' })
      };
    });

    it('mirrors VSIX when Claude Code VSCode updates', async () => {
      const vsCodeTool: ToolConfig = {
        name: 'Claude Code VSCode',
        type: 'vscode-marketplace',
        extensionId: 'anthropic.claude-code'
      };
      const checkerWithMirror = new Checker(
        [vsCodeTool],
        mockStorage as any,
        mockNotifier as any,
        mockVsixMirror as any
      );

      mockStorage.getVersion.mockReturnValue('2.1.8');
      vi.mocked(fetchVersion).mockResolvedValue('2.1.9');

      await checkerWithMirror.checkAll();

      expect(mockVsixMirror.mirror).toHaveBeenCalledWith('2.1.9');
      expect(mockStorage.setMirrorUrl).toHaveBeenCalledWith('Claude Code VSCode', 'github.com/test/url.vsix');
    });

    it('does not mirror when version unchanged', async () => {
      const vsCodeTool: ToolConfig = {
        name: 'Claude Code VSCode',
        type: 'vscode-marketplace',
        extensionId: 'anthropic.claude-code'
      };
      const checkerWithMirror = new Checker(
        [vsCodeTool],
        mockStorage as any,
        mockNotifier as any,
        mockVsixMirror as any
      );

      mockStorage.getVersion.mockReturnValue('2.1.9');
      vi.mocked(fetchVersion).mockResolvedValue('2.1.9');

      await checkerWithMirror.checkAll();

      expect(mockVsixMirror.mirror).not.toHaveBeenCalled();
    });

    it('continues if mirror fails', async () => {
      const vsCodeTool: ToolConfig = {
        name: 'Claude Code VSCode',
        type: 'vscode-marketplace',
        extensionId: 'anthropic.claude-code'
      };
      mockVsixMirror.mirror.mockResolvedValue({ success: false, error: 'network error' });

      const checkerWithMirror = new Checker(
        [vsCodeTool],
        mockStorage as any,
        mockNotifier as any,
        mockVsixMirror as any
      );

      mockStorage.getVersion.mockReturnValue('2.1.8');
      vi.mocked(fetchVersion).mockResolvedValue('2.1.9');

      await checkerWithMirror.checkAll();

      // Version should still be updated
      expect(mockStorage.setVersion).toHaveBeenCalledWith('Claude Code VSCode', '2.1.9');
      // But no mirror URL stored
      expect(mockStorage.setMirrorUrl).not.toHaveBeenCalled();
    });
  });
});
