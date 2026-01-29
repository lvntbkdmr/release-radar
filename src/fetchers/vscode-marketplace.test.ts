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

  it('skips pre-release versions with flag', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        results: [{
          extensions: [{
            versions: [
              {
                version: '2026.1.2026012801',
                properties: [{ key: 'Microsoft.VisualStudio.Code.PreRelease', value: 'true' }]
              },
              { version: '2026.0.0', properties: [] }
            ]
          }]
        }]
      })
    });

    const version = await fetchVSCodeMarketplace('ms-python.python');
    expect(version).toBe('2026.0.0');
  });

  it('skips pre-release versions with long build numbers', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        results: [{
          extensions: [{
            versions: [
              { version: '1.17.10291017' },  // Long build number = pre-release
              { version: '1.16.0' }
            ]
          }]
        }]
      })
    });

    const version = await fetchVSCodeMarketplace('ms-python.vscode-python-envs');
    expect(version).toBe('1.16.0');
  });
});
