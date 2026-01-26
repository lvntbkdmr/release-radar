import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VsixMirror } from './vsix-mirror.js';
import { execSync } from 'child_process';
import { existsSync, unlinkSync } from 'fs';

vi.mock('child_process', () => ({
  execSync: vi.fn()
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  unlinkSync: vi.fn()
}));

describe('VsixMirror', () => {
  let mirror: VsixMirror;

  beforeEach(() => {
    vi.clearAllMocks();
    mirror = new VsixMirror();
  });

  describe('mirror', () => {
    it('returns existing URL if release already exists', async () => {
      // gh release view succeeds = release exists
      vi.mocked(execSync).mockReturnValueOnce(Buffer.from(''));

      const result = await mirror.mirror('2.1.9');

      expect(result.success).toBe(true);
      expect(result.downloadUrl).toBe(
        'github.com/lvntbkdmr/apps/releases/download/claude-code-vsix-v2.1.9/claude-code-2.1.9-win32-x64.vsix'
      );
      // Should not attempt to create release
      expect(execSync).toHaveBeenCalledTimes(1);
    });

    it('returns error when marketplace query fails', async () => {
      // gh release view fails = release does not exist
      vi.mocked(execSync).mockImplementationOnce(() => {
        throw new Error('release not found');
      });
      // curl for marketplace query fails
      vi.mocked(execSync).mockImplementationOnce(() => {
        throw new Error('network error');
      });

      const result = await mirror.mirror('2.1.9');

      expect(result.success).toBe(false);
      expect(result.error).toContain('network error');
    });

    it('successfully mirrors new version through full flow', async () => {
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

      // 1. gh release view fails = release does not exist
      vi.mocked(execSync).mockImplementationOnce(() => {
        throw new Error('release not found');
      });
      // 2. curl marketplace query succeeds
      vi.mocked(execSync).mockReturnValueOnce(marketplaceResponse);
      // 3. curl download succeeds (returns empty)
      vi.mocked(execSync).mockReturnValueOnce('');
      // 4. gh release create succeeds
      vi.mocked(execSync).mockReturnValueOnce('');

      // Mock existsSync to return true (file exists after download)
      vi.mocked(existsSync).mockReturnValue(true);

      const result = await mirror.mirror('2.1.9');

      expect(result.success).toBe(true);
      expect(result.downloadUrl).toBe(
        'github.com/lvntbkdmr/apps/releases/download/claude-code-vsix-v2.1.9/claude-code-2.1.9-win32-x64.vsix'
      );
      expect(execSync).toHaveBeenCalledTimes(4);

      // Verify the gh release create was called with correct arguments
      const lastCall = vi.mocked(execSync).mock.calls[3][0];
      expect(lastCall).toContain('gh release create');
      expect(lastCall).toContain('claude-code-vsix-v2.1.9');
      expect(lastCall).toContain('--repo lvntbkdmr/apps');

      // Verify cleanup was called
      expect(unlinkSync).toHaveBeenCalled();
    });
  });

  describe('releaseExists', () => {
    it('returns true when release exists', async () => {
      vi.mocked(execSync).mockReturnValueOnce(Buffer.from(''));

      const exists = await mirror.releaseExists('claude-code-vsix-v2.1.9');

      expect(exists).toBe(true);
      expect(execSync).toHaveBeenCalledWith(
        'gh release view claude-code-vsix-v2.1.9 --repo lvntbkdmr/apps',
        expect.any(Object)
      );
    });

    it('returns false when release does not exist', async () => {
      vi.mocked(execSync).mockImplementationOnce(() => {
        throw new Error('release not found');
      });

      const exists = await mirror.releaseExists('claude-code-vsix-v2.1.9');

      expect(exists).toBe(false);
    });
  });
});
