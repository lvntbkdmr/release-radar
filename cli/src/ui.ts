import inquirer from 'inquirer';
import chalk from 'chalk';
import type { VersionsJsonTool } from './types.js';
import { isNpmTool } from './types.js';
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

export async function promptReconfigure(current: CliConfig): Promise<CliConfig> {
  console.log(chalk.bold('\nUpdate your settings:\n'));

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'nexusUrl',
      message: 'Nexus proxy base URL:',
      default: current.nexusUrl,
      validate: (input: string) => {
        if (!input.trim()) return 'URL is required';
        if (!input.startsWith('http')) return 'URL must start with http:// or https://';
        return true;
      },
    },
    {
      type: 'input',
      name: 'downloadDir',
      message: 'Download directory:',
      default: current.downloadDir,
      validate: (input: string) => input.trim() ? true : 'Directory is required',
    },
  ]);

  return {
    nexusUrl: answers.nexusUrl.replace(/\/$/, ''),
    downloadDir: answers.downloadDir.replace('~', process.env.HOME || ''),
  };
}

interface ToolChoiceBase {
  name: string;
  displayName: string;
  version: string;
  status: 'new' | 'update' | 'current';
  downloadedVersion: string | null;
}

interface ToolChoiceDownload extends ToolChoiceBase {
  type: 'download';
  downloadUrl: string;
  filename: string;
}

interface ToolChoiceNpm extends ToolChoiceBase {
  type: 'npm';
  package: string;
}

export type ToolChoice = ToolChoiceDownload | ToolChoiceNpm;

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

function createToolChoice(tool: VersionsJsonTool, downloaded: DownloadedState): ToolChoice {
  const { status, downloadedVersion } = getStatus(tool, downloaded);
  const base = {
    name: tool.name,
    displayName: tool.displayName,
    version: tool.version,
    status,
    downloadedVersion,
  };

  if (isNpmTool(tool)) {
    return {
      ...base,
      type: 'npm',
      package: tool.package,
    };
  } else {
    return {
      ...base,
      type: 'download',
      downloadUrl: tool.downloadUrl,
      filename: tool.filename,
    };
  }
}

export interface TableRow {
  displayName: string;
  version: string;
  downloadedVersion: string;
  status: 'new' | 'update' | 'current';
  type: 'npm' | 'download';
}

export function renderTable(rows: TableRow[]): void {
  // Calculate dynamic column widths
  const colWidths = {
    tool: Math.max(4, ...rows.map(r => r.displayName.length)) + 2,
    latest: Math.max(6, ...rows.map(r => r.version.length)) + 2,
    downloaded: Math.max(10, ...rows.map(r => r.downloadedVersion.length)) + 2,
    status: 8,
    type: 4,
  };

  const totalWidth = colWidths.tool + colWidths.latest + colWidths.downloaded + colWidths.status + colWidths.type + 2;

  // Header
  console.log(chalk.bold(
    '  ' +
    'Tool'.padEnd(colWidths.tool) +
    'Latest'.padEnd(colWidths.latest) +
    'Downloaded'.padEnd(colWidths.downloaded) +
    'Status'.padEnd(colWidths.status) +
    'Type'
  ));
  console.log(chalk.gray('─'.repeat(totalWidth)));

  // Rows
  for (const row of rows) {
    let statusStr: string;
    switch (row.status) {
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
    const typeStr = row.type === 'npm' ? chalk.magenta('npm') : chalk.cyan('wget');

    console.log(
      '  ' +
      row.displayName.padEnd(colWidths.tool) +
      row.version.padEnd(colWidths.latest) +
      row.downloadedVersion.padEnd(colWidths.downloaded) +
      statusStr.padEnd(colWidths.status + 5) + // +5 for chalk color codes
      typeStr
    );
  }
}

export async function promptToolSelection(
  tools: VersionsJsonTool[],
  downloaded: DownloadedState,
  generatedAt: string
): Promise<ToolChoice[]> {
  const choices: ToolChoice[] = tools.map((tool) => createToolChoice(tool, downloaded));

  console.log(chalk.bold(`\nrelease-radar-cli`));
  console.log(chalk.gray(`Last updated: ${new Date(generatedAt).toLocaleString()}\n`));

  // Convert to table rows and display
  const rows: TableRow[] = choices.map(choice => ({
    displayName: choice.displayName,
    version: choice.version,
    downloadedVersion: choice.downloadedVersion ?? '-',
    status: choice.status,
    type: choice.type === 'npm' ? 'npm' : 'download',
  }));

  renderTable(rows);
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
