import { describe, it, expect } from 'vitest';
import { generateVersionsJson } from './versions-generator.js';
import type { DownloadsConfig, VersionsJsonToolDownload, VersionsJsonToolNpm } from './types.js';

describe('generateVersionsJson', () => {
  it('merges version data with download config', () => {
    const versions: Record<string, string> = {
      'Ninja': '1.12.0',
      'CMake': '3.28.0',
    };

    const downloads: DownloadsConfig = {
      'Ninja': {
        displayName: 'Ninja Build',
        downloadUrl: 'github.com/ninja-build/ninja/releases/download/v{{VERSION}}/ninja-linux.zip',
        filename: 'ninja-{{VERSION}}-linux.zip',
      },
      'CMake': {
        displayName: 'CMake',
        downloadUrl: 'github.com/Kitware/CMake/releases/download/v{{VERSION}}/cmake-{{VERSION}}.tar.gz',
        filename: 'cmake-{{VERSION}}.tar.gz',
      },
    };

    const result = generateVersionsJson(versions, downloads);

    expect(result.tools).toHaveLength(2);
    expect(result.generatedAt).toBeDefined();

    const ninja = result.tools.find(t => t.name === 'Ninja') as VersionsJsonToolDownload;
    expect(ninja).toBeDefined();
    expect(ninja.displayName).toBe('Ninja Build');
    expect(ninja.version).toBe('1.12.0');
    expect(ninja.downloadUrl).toBe('{{NEXUS_URL}}/github.com/ninja-build/ninja/releases/download/v1.12.0/ninja-linux.zip');
    expect(ninja.filename).toBe('ninja-1.12.0-linux.zip');
  });

  it('only includes tools that have download config', () => {
    const versions: Record<string, string> = {
      'Ninja': '1.12.0',
      'UnknownTool': '1.0.0',
    };

    const downloads: DownloadsConfig = {
      'Ninja': {
        displayName: 'Ninja',
        downloadUrl: 'github.com/ninja/releases/{{VERSION}}/ninja.zip',
        filename: 'ninja-{{VERSION}}.zip',
      },
    };

    const result = generateVersionsJson(versions, downloads);

    expect(result.tools).toHaveLength(1);
    expect(result.tools[0].name).toBe('Ninja');
  });

  it('supports VERSION_BASE placeholder for versions like 2.52.0.windows.1', () => {
    const versions: Record<string, string> = {
      'Git': '2.52.0.windows.1',
    };

    const downloads: DownloadsConfig = {
      'Git': {
        displayName: 'Git for Windows',
        downloadUrl: 'github.com/git-for-windows/git/releases/download/v{{VERSION}}/Git-{{VERSION_BASE}}-64-bit.exe',
        filename: 'Git-{{VERSION_BASE}}-64-bit.exe',
      },
    };

    const result = generateVersionsJson(versions, downloads);

    expect(result.tools).toHaveLength(1);
    const git = result.tools[0] as VersionsJsonToolDownload;
    expect(git.downloadUrl).toBe('{{NEXUS_URL}}/github.com/git-for-windows/git/releases/download/v2.52.0.windows.1/Git-2.52.0-64-bit.exe');
    expect(git.filename).toBe('Git-2.52.0-64-bit.exe');
  });

  it('generates npm tools correctly', () => {
    const versions: Record<string, string> = {
      'Ralphy': '2.0.0',
    };

    const downloads: DownloadsConfig = {
      'Ralphy': {
        type: 'npm',
        displayName: 'Ralphy CLI',
        package: 'ralphy-cli',
      },
    };

    const result = generateVersionsJson(versions, downloads);

    expect(result.tools).toHaveLength(1);
    const ralphy = result.tools[0] as VersionsJsonToolNpm;
    expect(ralphy.name).toBe('Ralphy');
    expect(ralphy.displayName).toBe('Ralphy CLI');
    expect(ralphy.version).toBe('2.0.0');
    expect(ralphy.type).toBe('npm');
    expect(ralphy.package).toBe('ralphy-cli');
    expect((ralphy as any).downloadUrl).toBeUndefined();
  });
});
