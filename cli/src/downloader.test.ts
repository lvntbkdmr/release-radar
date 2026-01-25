import { describe, it, expect } from 'vitest';
import { buildWgetCommand, replaceNexusUrl, buildNpmUpdateCommand } from './downloader.js';

describe('downloader', () => {
  describe('replaceNexusUrl', () => {
    it('replaces {{NEXUS_URL}} placeholder', () => {
      const url = '{{NEXUS_URL}}/github.com/ninja/v1.0/ninja.zip';
      const result = replaceNexusUrl(url, 'http://nexus.local');
      expect(result).toBe('http://nexus.local/github.com/ninja/v1.0/ninja.zip');
    });
  });

  describe('buildWgetCommand', () => {
    it('builds correct wget command', () => {
      const cmd = buildWgetCommand(
        'http://nexus.local/file.zip',
        '/downloads/file.zip'
      );
      expect(cmd).toBe('wget -O "/downloads/file.zip" "http://nexus.local/file.zip"');
    });
  });

  describe('buildNpmUpdateCommand', () => {
    it('builds correct npm update command', () => {
      const cmd = buildNpmUpdateCommand('ralphy-cli');
      expect(cmd).toBe('npm update -g ralphy-cli');
    });
  });
});
