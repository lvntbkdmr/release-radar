// src/fetchers/npm.ts
export async function fetchNpmVersion(packageName: string): Promise<string> {
  const url = `https://registry.npmjs.org/${packageName}/latest`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`npm registry error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as { version: string };
  return data.version;
}
