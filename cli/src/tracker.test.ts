import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DownloadTracker } from './tracker.js';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('DownloadTracker', () => {
  let tempDir: string;
  let tracker: DownloadTracker;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'tracker-test-'));
    tracker = new DownloadTracker(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true });
  });

  it('returns null for untracked tool', () => {
    expect(tracker.getDownloadedVersion('unknown')).toBeNull();
  });

  it('tracks downloaded version', () => {
    tracker.recordDownload('Ninja', '1.12.0', 'ninja-1.12.0.zip');

    const version = tracker.getDownloadedVersion('Ninja');
    expect(version).toBe('1.12.0');
  });

  it('returns all downloaded tools', () => {
    tracker.recordDownload('Ninja', '1.12.0', 'ninja.zip');
    tracker.recordDownload('CMake', '3.28.0', 'cmake.tar.gz');

    const all = tracker.getAll();
    expect(Object.keys(all)).toHaveLength(2);
    expect(all['Ninja'].version).toBe('1.12.0');
    expect(all['CMake'].version).toBe('3.28.0');
  });
});
