// src/fetchers/github-release.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchGitHubRelease } from './github-release.js';

describe('fetchGitHubRelease', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('extracts version from tag_name', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ tag_name: 'v1.12.0' })
    });

    const version = await fetchGitHubRelease('ninja-build/ninja');

    expect(version).toBe('1.12.0');
    expect(fetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/ninja-build/ninja/releases/latest',
      expect.any(Object)
    );
  });

  it('handles tag without v prefix', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ tag_name: '2.44.0' })
    });

    const version = await fetchGitHubRelease('git-for-windows/git');
    expect(version).toBe('2.44.0');
  });

  it('throws on API error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found'
    });

    await expect(fetchGitHubRelease('invalid/repo'))
      .rejects.toThrow('GitHub API error: 404 Not Found');
  });
});
