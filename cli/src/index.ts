import chalk from 'chalk';
import { ConfigManager } from './config.js';
import { DownloadTracker } from './tracker.js';
import { loadVersions } from './versions.js';
import { checkAndUpdate } from './updater.js';
import { downloadFile } from './downloader.js';
import { promptSetup, promptToolSelection } from './ui.js';

async function main(): Promise<void> {
  const configManager = new ConfigManager();
  const tracker = new DownloadTracker();

  // First run setup
  if (!configManager.isConfigured()) {
    const config = await promptSetup();
    configManager.save(config);
    console.log(chalk.green('\nConfiguration saved!\n'));
  }

  // Check for updates and restart if needed
  await checkAndUpdate();

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

  // Download selected tools
  console.log('');
  for (const tool of selected) {
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
    } else {
      console.log(chalk.red(`  Failed: ${result.error}\n`));
    }
  }

  console.log(chalk.green('Done!'));
}

main().catch((error) => {
  console.error(chalk.red('Error:'), error.message);
  process.exit(1);
});
