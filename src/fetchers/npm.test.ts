// src/fetchers/npm.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchNpmVersion } from './npm.js';

describe('fetchNpmVersion', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('extracts version from npm registry', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '2.1.0' })
    });

    const version = await fetchNpmVersion('ralphy-cli');

    expect(version).toBe('2.1.0');
    expect(fetch).toHaveBeenCalledWith(
      'https://registry.npmjs.org/ralphy-cli/latest'
    );
  });

  it('throws on registry error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found'
    });

    await expect(fetchNpmVersion('nonexistent-package'))
      .rejects.toThrow('npm registry error: 404 Not Found');
  });
});
