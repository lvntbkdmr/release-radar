import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AssetMirror } from './asset-mirror.js';
import { execSync } from 'child_process';
import { existsSync, unlinkSync } from 'fs';

vi.mock('child_process', () => ({
  execSync: vi.fn()
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  unlinkSync: vi.fn()
}));

describe('AssetMirror', () => {
  let mirror: AssetMirror;

  beforeEach(() => {
    vi.clearAllMocks();
    mirror = new AssetMirror();
  });

  describe('buildTag', () => {
    it('converts tool name to kebab-case tag', () => {
      expect(mirror.buildTag('VSCode', '1.96.0')).toBe('vscode-v1.96.0');
      expect(mirror.buildTag('Claude Code VSCode', '2.1.9')).toBe('claude-code-vscode-v2.1.9');
      expect(mirror.buildTag('Ninja', '1.12.0')).toBe('ninja-v1.12.0');
    });
  });

  describe('mirror', () => {
    it('returns existing URL if release already exists', async () => {
      vi.mocked(execSync).mockReturnValueOnce(Buffer.from(''));

      const result = await mirror.mirror('VSCode', '1.96.0', {
        sourceUrl: 'https://update.code.visualstudio.com/latest/win32-x64/stable'
      }, 'VSCode-{{VERSION}}-win-x64.msi');

      expect(result.success).toBe(true);
      expect(result.downloadUrl).toBe(
        'github.com/lvntbkdmr/apps/releases/download/vscode-v1.96.0/VSCode-1.96.0-win-x64.msi'
      );
      expect(execSync).toHaveBeenCalledTimes(1);
    });

    it('returns error when download fails', async () => {
      // gh release view fails = release does not exist
      vi.mocked(execSync).mockImplementationOnce(() => {
        throw new Error('release not found');
      });
      // curl download fails
      vi.mocked(execSync).mockImplementationOnce(() => {
        throw new Error('network error');
      });

      const result = await mirror.mirror('VSCode', '1.96.0', {
        sourceUrl: 'https://update.code.visualstudio.com/latest/win32-x64/stable'
      }, 'VSCode-{{VERSION}}-win-x64.msi');

      expect(result.success).toBe(false);
      expect(result.error).toContain('network error');
    });

    it('handles marketplace-api source for Claude Code VSCode', async () => {
      const marketplaceResponse = JSON.stringify({
        results: [{
          extensions: [{
            versions: [{
              version: '2.1.9',
              targetPlatform: 'win32-x64',
              files: [{
                assetType: 'Microsoft.VisualStudio.Services.VSIXPackage',
                source: 'https://marketplace.visualstudio.com/vsix/download'
              }]
            }]
          }]
        }]
      });

      // 1. gh release view fails
      vi.mocked(execSync).mockImplementationOnce(() => {
        throw new Error('release not found');
      });
      // 2. curl marketplace query succeeds
      vi.mocked(execSync).mockReturnValueOnce(marketplaceResponse);
      // 3. curl download succeeds
      vi.mocked(execSync).mockReturnValueOnce('');
      // 4. gh release create succeeds
      vi.mocked(execSync).mockReturnValueOnce('');

      vi.mocked(existsSync).mockReturnValue(true);

      const result = await mirror.mirror('Claude Code VSCode', '2.1.9', {
        sourceUrl: 'marketplace-api'
      }, 'claude-code-{{VERSION}}-win32-x64.vsix');

      expect(result.success).toBe(true);
      expect(result.downloadUrl).toBe(
        'github.com/lvntbkdmr/apps/releases/download/claude-code-vscode-v2.1.9/claude-code-2.1.9-win32-x64.vsix'
      );
    });

    it('successfully mirrors direct URL through full flow', async () => {
      // 1. gh release view fails
      vi.mocked(execSync).mockImplementationOnce(() => {
        throw new Error('release not found');
      });
      // 2. curl download succeeds
      vi.mocked(execSync).mockReturnValueOnce('');
      // 3. gh release create succeeds
      vi.mocked(execSync).mockReturnValueOnce('');

      vi.mocked(existsSync).mockReturnValue(true);

      const result = await mirror.mirror('VSCode', '1.96.0', {
        sourceUrl: 'https://update.code.visualstudio.com/latest/win32-x64/stable'
      }, 'VSCode-{{VERSION}}-win-x64.msi');

      expect(result.success).toBe(true);
      expect(execSync).toHaveBeenCalledTimes(3);
      expect(unlinkSync).toHaveBeenCalled();
    });
  });

  describe('releaseExists', () => {
    it('returns true when release exists', async () => {
      vi.mocked(execSync).mockReturnValueOnce(Buffer.from(''));

      const exists = await mirror.releaseExists('vscode-v1.96.0');

      expect(exists).toBe(true);
    });

    it('returns false when release does not exist', async () => {
      vi.mocked(execSync).mockImplementationOnce(() => {
        throw new Error('release not found');
      });

      const exists = await mirror.releaseExists('vscode-v1.96.0');

      expect(exists).toBe(false);
    });
  });
});
