import type { DownloadsConfig, VersionsJson, VersionsJsonTool } from './types.js';

export function generateVersionsJson(
  versions: Record<string, string>,
  downloads: DownloadsConfig
): VersionsJson {
  const tools: VersionsJsonTool[] = [];

  for (const [toolName, version] of Object.entries(versions)) {
    const downloadConfig = downloads[toolName];
    if (!downloadConfig) continue;

    const downloadUrl = '{{NEXUS_URL}}/' +
      downloadConfig.downloadUrl.replace(/\{\{VERSION\}\}/g, version);
    const filename = downloadConfig.filename.replace(/\{\{VERSION\}\}/g, version);

    tools.push({
      name: toolName,
      displayName: downloadConfig.displayName,
      version,
      publishedAt: new Date().toISOString(),
      downloadUrl,
      filename,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    tools,
  };
}
