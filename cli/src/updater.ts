import { execSync, spawn } from 'child_process';
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
    execSync('npm update -g @lvnt/release-radar-cli', {
      stdio: 'inherit',
    });
    console.log('Update complete. Restarting...\n');

    // Restart self
    const child = spawn(process.argv[0], process.argv.slice(1), {
      detached: true,
      stdio: 'inherit',
    });
    child.unref();
    process.exit(0);
  } catch (error) {
    console.error('Update failed, continuing with current version');
    return false;
  }
}
