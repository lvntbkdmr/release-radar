// src/fetchers/index.ts
import type { ToolConfig } from '../types.js';
import { fetchGitHubRelease } from './github-release.js';
import { fetchNpmVersion } from './npm.js';
import { fetchVSCodeMarketplace } from './vscode-marketplace.js';
import { fetchVSCodeVersion, fetchClaudeCodeCLI, fetchCMakeVersion } from './custom.js';

export async function fetchVersion(tool: ToolConfig): Promise<string> {
  switch (tool.type) {
    case 'github':
      if (!tool.repo) throw new Error(`Missing repo for ${tool.name}`);
      return fetchGitHubRelease(tool.repo);

    case 'npm':
      if (!tool.package) throw new Error(`Missing package for ${tool.name}`);
      return fetchNpmVersion(tool.package);

    case 'vscode-marketplace':
      if (!tool.extensionId) throw new Error(`Missing extensionId for ${tool.name}`);
      return fetchVSCodeMarketplace(tool.extensionId);

    case 'custom':
      return fetchCustom(tool);

    default:
      throw new Error(`Unknown tool type: ${(tool as ToolConfig).type}`);
  }
}

async function fetchCustom(tool: ToolConfig): Promise<string> {
  switch (tool.customFetcher) {
    case 'vscode':
      return fetchVSCodeVersion();
    case 'claude-cli':
      return fetchClaudeCodeCLI();
    case 'cmake':
      return fetchCMakeVersion();
    default:
      throw new Error(`Unknown custom fetcher: ${tool.customFetcher}`);
  }
}
