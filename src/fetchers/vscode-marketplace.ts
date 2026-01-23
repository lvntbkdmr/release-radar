// src/fetchers/vscode-marketplace.ts
interface MarketplaceResponse {
  results: Array<{
    extensions: Array<{
      versions: Array<{ version: string }>;
    }>;
  }>;
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
      flags: 0x200 // Include versions
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

  return extension.versions[0].version;
}
