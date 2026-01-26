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

export interface MirrorConfig {
  sourceUrl: string;  // URL or "marketplace-api"
}

export interface DownloadConfigUrl {
  type?: 'download';  // default if not specified
  displayName: string;
  downloadUrl: string;  // Template with {{VERSION}} placeholder
  filename: string;     // Template with {{VERSION}} placeholder
  mirror?: MirrorConfig;  // optional mirror config
}

export interface DownloadConfigNpm {
  type: 'npm';
  displayName: string;
  package: string;  // npm package name
}

export type DownloadConfig = DownloadConfigUrl | DownloadConfigNpm;

export interface DownloadsConfig {
  [toolName: string]: DownloadConfig;
}

export interface VersionsJsonToolDownload {
  name: string;
  displayName: string;
  version: string;
  publishedAt: string;
  type?: 'download';  // default
  downloadUrl: string;  // With {{NEXUS_URL}} placeholder
  filename: string;
}

export interface VersionsJsonToolNpm {
  name: string;
  displayName: string;
  version: string;
  publishedAt: string;
  type: 'npm';
  package: string;
}

export type VersionsJsonTool = VersionsJsonToolDownload | VersionsJsonToolNpm;

export interface VersionsJson {
  generatedAt: string;
  tools: VersionsJsonTool[];
}
