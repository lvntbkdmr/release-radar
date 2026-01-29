import chalk from 'chalk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ConfigManager } from './config.js';
import { DownloadTracker } from './tracker.js';
import { loadVersions } from './versions.js';
import { checkAndUpdate } from './updater.js';
import { downloadFile, updateNpmPackage } from './downloader.js';
import { promptSetup, promptToolSelection, renderTable, isVscodeExtension, type ToolChoice, type TableRow } from './ui.js';
import { isNpmTool } from './types.js';

function getVersion(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const pkgPath = join(__dirname, '..', 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  return pkg.version;
}

function showLogo(): void {
  const version = getVersion();
  const logo = `
${chalk.cyan('  ____      _                      ____           _            ')}
${chalk.cyan(' |  _ \\ ___| | ___  __ _ ___  ___ |  _ \\ __ _  __| | __ _ _ __ ')}
${chalk.cyan(' | |_) / _ \\ |/ _ \\/ _` / __|/ _ \\| |_) / _` |/ _` |/ _` | \'__|')}
${chalk.cyan(' |  _ <  __/ |  __/ (_| \\__ \\  __/|  _ < (_| | (_| | (_| | |   ')}
${chalk.cyan(' |_| \\_\\___|_|\\___|\\__,_|___/\\___||_| \\_\\__,_|\\__,_|\\__,_|_|   ')}

${chalk.gray('  Tool Download Manager')}                        ${chalk.yellow(`v${version}`)}
`;
  console.log(logo);
}

function showHelp(): void {
  const version = getVersion();
  console.log(`
${chalk.bold('release-radar-cli')} v${version}

${chalk.bold('USAGE:')}
  release-radar-cli [command] [options]

${chalk.bold('COMMANDS:')}
  ${chalk.cyan('(default)')}    Interactive mode - select and download tools
  ${chalk.cyan('status')}       Show tool versions and download status
  ${chalk.cyan('config')}       Configure or reconfigure settings (Nexus URL, download dir)
  ${chalk.cyan('version')}      Show CLI version
  ${chalk.cyan('help')}         Show this help message

${chalk.bold('OPTIONS:')}
  ${chalk.cyan('-v, --version')}    Show version number
  ${chalk.cyan('-h, --help')}       Show help
  ${chalk.cyan('--skip-update')}    Skip auto-update check on startup

${chalk.bold('EXAMPLES:')}
  release-radar-cli              # Interactive mode
  release-radar-cli status       # Show all tool versions
  release-radar-cli config       # Reconfigure settings
  release-radar-cli --version    # Show version

${chalk.bold('CONFIG LOCATION:')}
  ~/.release-radar-cli/config.json

${chalk.gray('For more info: https://github.com/lvntbkdmr/release-radar')}
`);
}

async function showStatus(): Promise<void> {
  const tracker = new DownloadTracker();
  const versions = loadVersions();
  const downloaded = tracker.getAll();

  showLogo();
  console.log(chalk.bold('Tool Status:\n'));

  const rows: TableRow[] = versions.tools.map(tool => {
    const record = downloaded[tool.name];
    let status: 'new' | 'update' | 'current';
    if (!record) {
      status = 'new';
    } else if (record.version !== tool.version) {
      status = 'update';
    } else {
      status = 'current';
    }

    return {
      displayName: tool.displayName,
      version: tool.version,
      downloadedVersion: record?.version ?? '-',
      status,
      type: isNpmTool(tool) ? 'npm' : 'download',
      category: isVscodeExtension(tool) ? 'vscode-extension' : 'tool',
    };
  });

  renderTable(rows);
  console.log('');
}

async function runConfig(): Promise<void> {
  const configManager = new ConfigManager();

  // Check if already configured and show current values
  if (configManager.isConfigured()) {
    const current = configManager.load();
    console.log(chalk.bold('\nCurrent configuration:'));
    console.log(`  Nexus URL:      ${chalk.cyan(current.nexusUrl)}`);
    console.log(`  Download dir:   ${chalk.cyan(current.downloadDir)}`);
    console.log('');

    const { reconfigure } = await (await import('inquirer')).default.prompt([
      {
        type: 'confirm',
        name: 'reconfigure',
        message: 'Do you want to update these settings?',
        default: false,
      },
    ]);

    if (!reconfigure) {
      console.log(chalk.gray('Configuration unchanged.'));
      return;
    }

    // Prompt with current values as defaults
    const { promptReconfigure } = await import('./ui.js');
    const config = await promptReconfigure(current);
    configManager.save(config);
  } else {
    const config = await promptSetup();
    configManager.save(config);
  }

  console.log(chalk.green('\nConfiguration saved!'));
}

async function runInteractive(): Promise<void> {
  const configManager = new ConfigManager();
  const tracker = new DownloadTracker();

  // Check for updates first (before any prompts) unless --skip-update is passed
  const skipUpdate = process.argv.includes('--skip-update');
  if (!skipUpdate) {
    await checkAndUpdate();
  }

  // Show logo
  showLogo();

  // First run setup
  if (!configManager.isConfigured()) {
    const config = await promptSetup();
    configManager.save(config);
    console.log(chalk.green('\nConfiguration saved!\n'));
  }

  // Load data
  const config = configManager.load();
  const versions = loadVersions();
  const downloaded = tracker.getAll();

  // Show interactive menu
  const selected = await promptToolSelection(
    versions.tools,
    downloaded,
    versions.generatedAt
  );

  if (selected.length === 0) {
    console.log(chalk.gray('\nNo tools selected. Exiting.'));
    return;
  }

  // Download/update selected tools
  console.log('');
  const successes: { name: string; version: string; type: 'download' | 'npm' }[] = [];
  const failures: { name: string; version: string; error: string }[] = [];

  for (const tool of selected) {
    if (tool.type === 'npm') {
      console.log(chalk.bold(`Updating npm package ${tool.displayName} (${tool.package})...`));
      const result = updateNpmPackage(tool.package);

      if (result.success) {
        tracker.recordDownload(tool.name, tool.version, `npm:${tool.package}`);
        console.log(chalk.green(`  Updated ${tool.package} to ${tool.version} ✓\n`));
        successes.push({ name: tool.displayName, version: tool.version, type: 'npm' });
      } else {
        console.log(chalk.red(`  Failed: ${result.error}\n`));
        failures.push({ name: tool.displayName, version: tool.version, error: result.error || 'Unknown error' });
      }
    } else {
      console.log(chalk.bold(`Downloading ${tool.displayName} ${tool.version}...`));
      const result = downloadFile(
        tool.downloadUrl,
        config.downloadDir,
        tool.filename,
        config.nexusUrl
      );

      if (result.success) {
        tracker.recordDownload(tool.name, tool.version, tool.filename);
        console.log(chalk.green(`  Saved to ${config.downloadDir}/${tool.filename} ✓\n`));
        successes.push({ name: tool.displayName, version: tool.version, type: 'download' });
      } else {
        console.log(chalk.red(`  Failed: ${result.error}\n`));
        failures.push({ name: tool.displayName, version: tool.version, error: result.error || 'Unknown error' });
      }
    }
  }

  // Summary report
  console.log(chalk.bold('─'.repeat(50)));
  console.log(chalk.bold('Summary\n'));

  if (successes.length > 0) {
    console.log(chalk.green(`✓ ${successes.length} succeeded:`));
    for (const s of successes) {
      console.log(chalk.green(`  • ${s.name} ${s.version}`));
    }
  }

  if (failures.length > 0) {
    console.log(chalk.red(`\n✗ ${failures.length} failed:`));
    for (const f of failures) {
      console.log(chalk.red(`  • ${f.name} ${f.version}: ${f.error}`));
    }
  }

  console.log('');
  if (failures.length === 0) {
    console.log(chalk.green('All downloads completed successfully!'));
  } else if (successes.length === 0) {
    console.log(chalk.red('All downloads failed.'));
  } else {
    console.log(chalk.yellow(`Completed with ${failures.length} failure(s).`));
  }
}

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);

  // Handle flags first
  if (rawArgs.includes('-v') || rawArgs.includes('--version')) {
    console.log(getVersion());
    return;
  }

  if (rawArgs.includes('-h') || rawArgs.includes('--help')) {
    showHelp();
    return;
  }

  const args = rawArgs.filter(arg => !arg.startsWith('--') && !arg.startsWith('-'));
  const command = args[0];

  switch (command) {
    case 'version':
      console.log(getVersion());
      break;
    case 'help':
      showHelp();
      break;
    case 'status':
      await showStatus();
      break;
    case 'config':
      await runConfig();
      break;
    default:
      // Check if stdin is a TTY for interactive mode
      if (!process.stdin.isTTY) {
        console.error(chalk.red('Error: Interactive mode requires a TTY. Use "status" command for non-interactive use.'));
        process.exit(1);
      }
      await runInteractive();
      break;
  }
}

main().catch((error) => {
  console.error(chalk.red('Error:'), error.message);
  process.exit(1);
});
