// src/fetchers/vscode-marketplace.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchVSCodeMarketplace } from './vscode-marketplace.js';

describe('fetchVSCodeMarketplace', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('extracts version from marketplace API', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        results: [{
          extensions: [{
            versions: [{ version: '1.2.3' }]
          }]
        }]
      })
    });

    const version = await fetchVSCodeMarketplace('anthropic.claude-code');

    expect(version).toBe('1.2.3');
  });

  it('throws on API error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error'
    });

    await expect(fetchVSCodeMarketplace('some.extension'))
      .rejects.toThrow('VS Code Marketplace error: 500 Internal Server Error');
  });

  it('throws when extension not found', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results: [{ extensions: [] }] })
    });

    await expect(fetchVSCodeMarketplace('nonexistent.extension'))
      .rejects.toThrow('Extension not found: nonexistent.extension');
  });
});
