import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConfigManager } from './config.js';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('ConfigManager', () => {
  let tempDir: string;
  let configManager: ConfigManager;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'cli-test-'));
    configManager = new ConfigManager(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true });
  });

  it('returns false for isConfigured when no config exists', () => {
    expect(configManager.isConfigured()).toBe(false);
  });

  it('saves and loads config correctly', () => {
    configManager.save({
      nexusUrl: 'http://nexus.local',
      downloadDir: '/downloads',
    });

    expect(configManager.isConfigured()).toBe(true);

    const loaded = configManager.load();
    expect(loaded.nexusUrl).toBe('http://nexus.local');
    expect(loaded.downloadDir).toBe('/downloads');
  });

  it('creates config directory if it does not exist', () => {
    const configPath = join(tempDir, 'config.json');
    expect(existsSync(configPath)).toBe(false);

    configManager.save({
      nexusUrl: 'http://nexus.local',
      downloadDir: '/downloads',
    });

    expect(existsSync(configPath)).toBe(true);
  });
});
