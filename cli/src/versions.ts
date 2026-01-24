import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type { VersionsJson } from './types.js';

export function loadVersions(): VersionsJson {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  // In dist/, versions.json is at package root
  const versionsPath = join(__dirname, '..', 'versions.json');
  const content = readFileSync(versionsPath, 'utf-8');
  return JSON.parse(content);
}
