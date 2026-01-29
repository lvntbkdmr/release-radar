// src/fetchers/github-release.ts

/**
 * Fetches the latest stable release version from a GitHub repository.
 * Uses /releases/latest endpoint which excludes pre-releases and drafts by design.
 * Set GITHUB_TOKEN env var to avoid rate limits (60/hour unauthenticated, 5000/hour with token).
 */
export async function fetchGitHubRelease(repo: string): Promise<string> {
  // Note: /releases/latest only returns stable releases (no pre-releases or drafts)
  const url = `https://api.github.com/repos/${repo}/releases/latest`;

  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'ReleaseRadar/1.0'
  };

  // Use GitHub token if available to avoid rate limits
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    headers['Authorization'] = `token ${token}`;
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error(`GitHub API error: 403 rate limit exceeded. Set GITHUB_TOKEN env var.`);
    }
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as { tag_name: string };
  const version = data.tag_name.replace(/^v/, '');

  return version;
}
