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

export interface DownloadConfig {
  displayName: string;
  downloadUrl: string;  // Template with {{VERSION}} placeholder
  filename: string;     // Template with {{VERSION}} placeholder
}

export interface DownloadsConfig {
  [toolName: string]: DownloadConfig;
}

export interface VersionsJsonTool {
  name: string;
  displayName: string;
  version: string;
  publishedAt: string;
  downloadUrl: string;  // With {{NEXUS_URL}} placeholder
  filename: string;
}

export interface VersionsJson {
  generatedAt: string;
  tools: VersionsJsonTool[];
}
