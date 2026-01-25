export interface VersionsJsonToolDownload {
  name: string;
  displayName: string;
  version: string;
  publishedAt: string;
  type?: 'download';  // default
  downloadUrl: string;
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

// Type guards
export function isNpmTool(tool: VersionsJsonTool): tool is VersionsJsonToolNpm {
  return tool.type === 'npm';
}

export function isDownloadTool(tool: VersionsJsonTool): tool is VersionsJsonToolDownload {
  return tool.type !== 'npm';
}
