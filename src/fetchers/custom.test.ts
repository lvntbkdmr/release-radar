// src/fetchers/custom.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchVSCodeVersion, fetchClaudeCodeCLI, fetchCMakeVersion } from './custom.js';

describe('custom fetchers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchVSCodeVersion', () => {
    it('extracts first version from releases array', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(['1.96.0', '1.95.3', '1.95.2'])
      });

      const version = await fetchVSCodeVersion();

      expect(version).toBe('1.96.0');
      expect(fetch).toHaveBeenCalledWith(
        'https://update.code.visualstudio.com/api/releases/stable'
      );
    });
  });

  describe('fetchClaudeCodeCLI', () => {
    it('extracts version from text response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('1.0.5')
      });

      const version = await fetchClaudeCodeCLI();
      expect(version).toBe('1.0.5');
    });

    it('falls back to GitHub on primary failure', async () => {
      global.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: false, status: 503 })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ tag_name: 'v1.0.6' })
        });

      const version = await fetchClaudeCodeCLI();
      expect(version).toBe('1.0.6');
    });
  });

  describe('fetchCMakeVersion', () => {
    it('extracts version from JSON endpoint', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ version: { string: '3.31.0' } })
      });

      const version = await fetchCMakeVersion();
      expect(version).toBe('3.31.0');
      expect(fetch).toHaveBeenCalledWith(
        'https://cmake.org/files/LatestRelease/cmake-latest-files-v1.json'
      );
    });

    it('falls back to HTML and returns newest (last) version', async () => {
      const html = `
        <a href="cmake-3.28.0-linux-x86_64.tar.gz">cmake-3.28.0-linux-x86_64.tar.gz</a>
        <a href="cmake-3.31.0-linux-x86_64.tar.gz">cmake-3.31.0-linux-x86_64.tar.gz</a>
      `;
      global.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: false, status: 404 })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(html)
        });

      const version = await fetchCMakeVersion();
      expect(version).toBe('3.31.0');
    });

    it('throws when no version found in listing', async () => {
      global.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: false, status: 404 })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve('<html>empty</html>')
        });

      await expect(fetchCMakeVersion())
        .rejects.toThrow('Could not parse CMake version from directory listing');
    });
  });
});
