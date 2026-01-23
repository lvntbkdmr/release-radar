// src/storage.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Storage, StorageState } from './storage.js';
import { writeFileSync, unlinkSync, mkdirSync, rmSync } from 'fs';

describe('Storage', () => {
  const testDir = './test-data';
  const testPath = `${testDir}/versions.json`;
  let storage: Storage;

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    storage = new Storage(testPath);
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('returns empty state when file does not exist', () => {
    const state = storage.load();
    expect(state).toEqual({ lastCheck: null, versions: {} });
  });

  it('loads existing state from file', () => {
    const existingState = {
      lastCheck: '2026-01-23T10:00:00Z',
      versions: { 'VSCode': '1.96.0' }
    };
    writeFileSync(testPath, JSON.stringify(existingState));

    const state = storage.load();
    expect(state).toEqual(existingState);
  });

  it('saves state to file', () => {
    const state: StorageState = {
      lastCheck: '2026-01-23T10:00:00Z',
      versions: { 'Ninja': '1.12.0' }
    };

    storage.save(state);

    const loaded = storage.load();
    expect(loaded).toEqual(state);
  });

  it('getVersion returns null for unknown tool', () => {
    expect(storage.getVersion('Unknown')).toBeNull();
  });

  it('getVersion returns stored version', () => {
    const state = { lastCheck: null, versions: { 'Git': '2.44.0' } };
    writeFileSync(testPath, JSON.stringify(state));
    storage = new Storage(testPath); // reload

    expect(storage.getVersion('Git')).toBe('2.44.0');
  });

  it('setVersion updates and persists', () => {
    storage.setVersion('Ninja', '1.12.0');

    // Reload and verify
    const newStorage = new Storage(testPath);
    expect(newStorage.getVersion('Ninja')).toBe('1.12.0');
  });
});
