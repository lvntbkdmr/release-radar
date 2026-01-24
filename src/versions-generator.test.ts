import { describe, it, expect } from 'vitest';
import { generateVersionsJson } from './versions-generator.js';
import type { DownloadsConfig } from './types.js';

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

    const ninja = result.tools.find(t => t.name === 'Ninja');
    expect(ninja).toBeDefined();
    expect(ninja!.displayName).toBe('Ninja Build');
    expect(ninja!.version).toBe('1.12.0');
    expect(ninja!.downloadUrl).toBe('{{NEXUS_URL}}/github.com/ninja-build/ninja/releases/download/v1.12.0/ninja-linux.zip');
    expect(ninja!.filename).toBe('ninja-1.12.0-linux.zip');
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
});
