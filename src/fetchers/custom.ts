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
  const response = await fetch('https://cmake.org/files/LatestRelease/');

  if (!response.ok) {
    throw new Error(`CMake fetch error: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const match = html.match(/cmake-(\d+\.\d+\.\d+)/);

  if (!match) {
    throw new Error('Could not parse CMake version from directory listing');
  }

  return match[1];
}
