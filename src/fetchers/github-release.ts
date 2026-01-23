// src/fetchers/github-release.ts
export async function fetchGitHubRelease(repo: string): Promise<string> {
  const url = `https://api.github.com/repos/${repo}/releases/latest`;

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'ReleaseRadar/1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as { tag_name: string };
  const version = data.tag_name.replace(/^v/, '');

  return version;
}
