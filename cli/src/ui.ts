import inquirer from 'inquirer';
import chalk from 'chalk';
import type { VersionsJsonTool } from './types.js';
import type { DownloadedState } from './tracker.js';
import type { CliConfig } from './config.js';

export async function promptSetup(): Promise<CliConfig> {
  console.log(chalk.bold('\nWelcome to release-radar-cli!\n'));
  console.log("Let's configure your settings.\n");

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'nexusUrl',
      message: 'Enter your Nexus proxy base URL:',
      validate: (input: string) => {
        if (!input.trim()) return 'URL is required';
        if (!input.startsWith('http')) return 'URL must start with http:// or https://';
        return true;
      },
    },
    {
      type: 'input',
      name: 'downloadDir',
      message: 'Enter download directory:',
      default: '~/downloads/tools',
      validate: (input: string) => input.trim() ? true : 'Directory is required',
    },
  ]);

  return {
    nexusUrl: answers.nexusUrl.replace(/\/$/, ''), // Remove trailing slash
    downloadDir: answers.downloadDir.replace('~', process.env.HOME || ''),
  };
}

interface ToolChoice {
  name: string;
  displayName: string;
  version: string;
  downloadUrl: string;
  filename: string;
  status: 'new' | 'update' | 'current';
  downloadedVersion: string | null;
}

function getStatus(
  tool: VersionsJsonTool,
  downloaded: DownloadedState
): { status: 'new' | 'update' | 'current'; downloadedVersion: string | null } {
  const record = downloaded[tool.name];
  if (!record) {
    return { status: 'new', downloadedVersion: null };
  }
  if (record.version !== tool.version) {
    return { status: 'update', downloadedVersion: record.version };
  }
  return { status: 'current', downloadedVersion: record.version };
}

export async function promptToolSelection(
  tools: VersionsJsonTool[],
  downloaded: DownloadedState,
  generatedAt: string
): Promise<ToolChoice[]> {
  const choices: ToolChoice[] = tools.map((tool) => {
    const { status, downloadedVersion } = getStatus(tool, downloaded);
    return {
      ...tool,
      status,
      downloadedVersion,
    };
  });

  console.log(chalk.bold(`\nrelease-radar-cli`));
  console.log(chalk.gray(`Last updated: ${new Date(generatedAt).toLocaleString()}\n`));

  // Display table
  console.log(chalk.bold('  Tool               Latest       Downloaded   Status'));
  console.log(chalk.gray('─'.repeat(60)));

  choices.forEach((choice) => {
    const downloadedStr = choice.downloadedVersion ?? '-';
    let statusStr: string;
    switch (choice.status) {
      case 'new':
        statusStr = chalk.blue('NEW');
        break;
      case 'update':
        statusStr = chalk.yellow('UPDATE');
        break;
      case 'current':
        statusStr = chalk.green('✓');
        break;
    }
    console.log(
      `  ${choice.displayName.padEnd(18)} ${choice.version.padEnd(12)} ${downloadedStr.padEnd(12)} ${statusStr}`
    );
  });

  console.log('');

  const { selected } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selected',
      message: 'Select tools to download:',
      choices: choices.map((choice) => ({
        name: `${choice.displayName} ${choice.version}`,
        value: choice,
        checked: choice.status !== 'current',
      })),
    },
  ]);

  return selected;
}
