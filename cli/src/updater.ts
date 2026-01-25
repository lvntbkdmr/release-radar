import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

function getCurrentVersion(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const pkgPath = join(__dirname, '..', 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  return pkg.version;
}

function getLatestVersion(): string | null {
  try {
    const result = execSync('npm view @lvnt/release-radar-cli version', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10000, // 10 second timeout
    });
    return result.trim();
  } catch {
    return null;
  }
}

export async function checkAndUpdate(): Promise<boolean> {
  const current = getCurrentVersion();
  const latest = getLatestVersion();

  if (!latest) {
    // Can't reach npm registry, continue with current
    return false;
  }

  if (current === latest) {
    return false;
  }

  console.log(`Updating from ${current} to ${latest}...`);

  try {
    // Use pipe instead of inherit to avoid messing with terminal state
    const result = execSync('npm update -g @lvnt/release-radar-cli', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (result) console.log(result);
    console.log('Update complete. Please run the command again.\n');
    process.exit(0);
  } catch (error) {
    console.error('Update failed, continuing with current version');
    return false;
  }
}
