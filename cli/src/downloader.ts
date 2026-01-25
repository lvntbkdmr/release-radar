import { execSync } from 'child_process';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

export function replaceNexusUrl(url: string, nexusUrl: string): string {
  return url.replace('{{NEXUS_URL}}', nexusUrl);
}

export function buildWgetCommand(url: string, outputPath: string): string {
  return `wget -O "${outputPath}" "${url}"`;
}

export interface DownloadResult {
  success: boolean;
  error?: string;
}

export function downloadFile(
  url: string,
  downloadDir: string,
  filename: string,
  nexusUrl: string
): DownloadResult {
  const resolvedUrl = replaceNexusUrl(url, nexusUrl);

  if (!existsSync(downloadDir)) {
    mkdirSync(downloadDir, { recursive: true });
  }

  const outputPath = join(downloadDir, filename);
  const command = buildWgetCommand(resolvedUrl, outputPath);

  try {
    execSync(command, { stdio: 'inherit' });
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

export function buildNpmUpdateCommand(packageName: string): string {
  return `npm update -g ${packageName}`;
}

export function updateNpmPackage(packageName: string): DownloadResult {
  const command = buildNpmUpdateCommand(packageName);

  try {
    execSync(command, { stdio: 'inherit' });
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}
