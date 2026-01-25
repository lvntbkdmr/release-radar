import type { DownloadsConfig, VersionsJson, VersionsJsonTool } from './types.js';

// Extract base version (e.g., "2.52.0" from "2.52.0.windows.1")
function getVersionBase(version: string): string {
  const match = version.match(/^(\d+\.\d+\.\d+)/);
  return match ? match[1] : version;
}

function applyVersionPlaceholders(template: string, version: string): string {
  return template
    .replace(/\{\{VERSION\}\}/g, version)
    .replace(/\{\{VERSION_BASE\}\}/g, getVersionBase(version));
}

export function generateVersionsJson(
  versions: Record<string, string>,
  downloads: DownloadsConfig
): VersionsJson {
  const tools: VersionsJsonTool[] = [];

  for (const [toolName, version] of Object.entries(versions)) {
    const downloadConfig = downloads[toolName];
    if (!downloadConfig) continue;

    if (downloadConfig.type === 'npm') {
      // npm package - no download URL, just package name
      tools.push({
        name: toolName,
        displayName: downloadConfig.displayName,
        version,
        publishedAt: new Date().toISOString(),
        type: 'npm',
        package: downloadConfig.package,
      });
    } else {
      // download type (default)
      const downloadUrl = '{{NEXUS_URL}}/' +
        applyVersionPlaceholders(downloadConfig.downloadUrl, version);
      const filename = applyVersionPlaceholders(downloadConfig.filename, version);

      tools.push({
        name: toolName,
        displayName: downloadConfig.displayName,
        version,
        publishedAt: new Date().toISOString(),
        downloadUrl,
        filename,
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    tools,
  };
}
