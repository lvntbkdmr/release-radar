// src/types.ts
export interface ToolConfig {
  name: string;
  type: 'github' | 'npm' | 'vscode-marketplace' | 'custom';
  repo?: string;           // for github type
  package?: string;        // for npm type
  extensionId?: string;    // for vscode-marketplace type
  url?: string;            // for custom type
  fallbackUrl?: string;    // optional fallback
  customFetcher?: string;  // which custom fetcher to use: 'vscode' | 'claude-cli' | 'cmake'
}

export interface Config {
  checkIntervalHours: number;
  tools: ToolConfig[];
}
