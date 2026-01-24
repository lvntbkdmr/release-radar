// src/fetchers/custom.ts

export async function fetchVSCodeVersion(): Promise<string> {
  const response = await fetch('https://update.code.visualstudio.com/api/releases/stable');

  if (!response.ok) {
    throw new Error(`VSCode API error: ${response.status} ${response.statusText}`);
  }

  const releases = await response.json() as string[];
  return releases[0];
}

export async function fetchClaudeCodeCLI(): Promise<string> {
  const primaryUrl = 'https://storage.googleapis.com/claude-code-dist-86c565f3-f756-42ad-8dfa-d59b1c096819/claude-code-releases/latest';
  const fallbackUrl = 'https://api.github.com/repos/anthropics/claude-code/releases/latest';

  try {
    const response = await fetch(primaryUrl);
    if (response.ok) {
      const version = await response.text();
      return version.trim();
    }
  } catch {
    // Fall through to fallback
  }

  const response = await fetch(fallbackUrl, {
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'ReleaseRadar/1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`Claude Code CLI fetch failed: ${response.status}`);
  }

  const data = await response.json() as { tag_name: string };
  return data.tag_name.replace(/^v/, '');
}

export async function fetchCMakeVersion(): Promise<string> {
  const jsonUrl = 'https://cmake.org/files/LatestRelease/cmake-latest-files-v1.json';
  const fallbackUrl = 'https://cmake.org/files/LatestRelease/';

  // Try JSON endpoint first
  try {
    const response = await fetch(jsonUrl);
    if (response.ok) {
      const data = await response.json() as { version: { string: string } };
      return data.version.string;
    }
  } catch {
    // Fall through to HTML parsing
  }

  // Fallback: parse HTML directory listing (items are oldest to newest)
  const response = await fetch(fallbackUrl);

  if (!response.ok) {
    throw new Error(`CMake fetch error: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const matches = html.matchAll(/cmake-(\d+\.\d+\.\d+)/g);
  const versions = [...matches].map(m => m[1]);

  if (versions.length === 0) {
    throw new Error('Could not parse CMake version from directory listing');
  }

  // Return last match (newest version)
  return versions[versions.length - 1];
}
