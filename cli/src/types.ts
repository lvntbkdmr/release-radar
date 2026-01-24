export interface VersionsJsonTool {
  name: string;
  displayName: string;
  version: string;
  publishedAt: string;
  downloadUrl: string;
  filename: string;
}

export interface VersionsJson {
  generatedAt: string;
  tools: VersionsJsonTool[];
}
