import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VsixMirror } from './vsix-mirror.js';
import { execSync } from 'child_process';

vi.mock('child_process', () => ({
  execSync: vi.fn()
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
