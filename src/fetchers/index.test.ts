// src/fetchers/index.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchVersion } from './index.js';
import type { ToolConfig } from '../types.js';

vi.mock('./github-release.js', () => ({
  fetchGitHubRelease: vi.fn().mockResolvedValue('1.12.0')
}));

vi.mock('./npm.js', () => ({
  fetchNpmVersion: vi.fn().mockResolvedValue('2.1.0')
}));

vi.mock('./vscode-marketplace.js', () => ({
  fetchVSCodeMarketplace: vi.fn().mockResolvedValue('1.2.3')
}));

vi.mock('./custom.js', () => ({
  fetchVSCodeVersion: vi.fn().mockResolvedValue('1.96.0'),
  fetchClaudeCodeCLI: vi.fn().mockResolvedValue('1.0.5'),
  fetchCMakeVersion: vi.fn().mockResolvedValue('3.28.0')
}));

describe('fetchVersion', () => {
  it('routes github type to GitHub fetcher', async () => {
    const tool: ToolConfig = { name: 'Ninja', type: 'github', repo: 'ninja-build/ninja' };
    const version = await fetchVersion(tool);
    expect(version).toBe('1.12.0');
  });

  it('routes npm type to npm fetcher', async () => {
    const tool: ToolConfig = { name: 'Ralphy', type: 'npm', package: 'ralphy-cli' };
    const version = await fetchVersion(tool);
    expect(version).toBe('2.1.0');
  });

  it('routes vscode-marketplace type', async () => {
    const tool: ToolConfig = { name: 'Claude Code', type: 'vscode-marketplace', extensionId: 'anthropic.claude-code' };
    const version = await fetchVersion(tool);
    expect(version).toBe('1.2.3');
  });

  it('routes custom type with customFetcher', async () => {
    const tool: ToolConfig = { name: 'VSCode', type: 'custom', customFetcher: 'vscode' };
    const version = await fetchVersion(tool);
    expect(version).toBe('1.96.0');
  });

  it('throws for unknown type', async () => {
    const tool = { name: 'Unknown', type: 'invalid' } as unknown as ToolConfig;
    await expect(fetchVersion(tool)).rejects.toThrow('Unknown tool type: invalid');
  });
});
