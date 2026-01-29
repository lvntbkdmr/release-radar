// src/fetchers/vscode-marketplace.ts
interface VersionProperty {
  key: string;
  value: string;
}

interface ExtensionVersion {
  version: string;
  properties?: VersionProperty[];
}

interface MarketplaceResponse {
  results: Array<{
    extensions: Array<{
      versions: ExtensionVersion[];
    }>;
  }>;
}

function isPreRelease(version: ExtensionVersion): boolean {
  // Check for pre-release property flag
  const preReleaseFlag = version.properties?.find(
    p => p.key === 'Microsoft.VisualStudio.Code.PreRelease'
  );
  if (preReleaseFlag?.value === 'true') {
    return true;
  }

  // Also detect pre-release by version format (e.g., "2026.1.2026012801" has date-like suffix)
  // Stable versions typically have 2-4 parts like "1.2.3" or "2026.0.0"
  const parts = version.version.split('.');
  if (parts.length >= 3) {
    const lastPart = parts[parts.length - 1];
    // If last part is unusually long (>4 digits), likely a pre-release build number
    if (lastPart.length > 4 && /^\d+$/.test(lastPart)) {
      return true;
    }
  }

  return false;
}

export async function fetchVSCodeMarketplace(extensionId: string): Promise<string> {
  const url = 'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json;api-version=7.1-preview.1'
    },
    body: JSON.stringify({
      filters: [{
        criteria: [{ filterType: 7, value: extensionId }]
      }],
      flags: 0x1 | 0x10 // IncludeVersions + IncludeVersionProperties
    })
  });

  if (!response.ok) {
    throw new Error(`VS Code Marketplace error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as MarketplaceResponse;
  const extension = data.results[0]?.extensions[0];

  if (!extension) {
    throw new Error(`Extension not found: ${extensionId}`);
  }

  // Find first stable (non-pre-release) version
  const stableVersion = extension.versions.find(v => !isPreRelease(v));

  if (!stableVersion) {
    // Fall back to first version if no stable found
    return extension.versions[0].version;
  }

  return stableVersion.version;
}
