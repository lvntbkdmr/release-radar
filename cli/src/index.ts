import chalk from 'chalk';
import { ConfigManager } from './config.js';
import { DownloadTracker } from './tracker.js';
import { loadVersions } from './versions.js';
import { checkAndUpdate } from './updater.js';
import { downloadFile, updateNpmPackage } from './downloader.js';
import { promptSetup, promptToolSelection, type ToolChoice } from './ui.js';
import { isNpmTool } from './types.js';

async function showStatus(): Promise<void> {
  const tracker = new DownloadTracker();
  const versions = loadVersions();
  const downloaded = tracker.getAll();

  console.log(chalk.bold('\nTool Status:\n'));
  console.log(chalk.bold('  Tool               Latest       Downloaded   Status   Type'));
  console.log(chalk.gray('─'.repeat(70)));

  for (const tool of versions.tools) {
    const record = downloaded[tool.name];
    const downloadedVersion = record?.version ?? '-';

    let status: string;
    if (!record) {
      status = chalk.blue('NEW');
    } else if (record.version !== tool.version) {
      status = chalk.yellow('UPDATE');
    } else {
      status = chalk.green('✓');
    }

    const typeStr = isNpmTool(tool) ? chalk.magenta('npm') : chalk.cyan('wget');
    console.log(`  ${tool.displayName.padEnd(18)} ${tool.version.padEnd(12)} ${downloadedVersion.padEnd(12)} ${status.padEnd(12)} ${typeStr}`);
  }
  console.log('');
}

async function runConfig(): Promise<void> {
  const configManager = new ConfigManager();
  const config = await promptSetup();
  configManager.save(config);
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
  const args = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
  const command = args[0];

  switch (command) {
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
