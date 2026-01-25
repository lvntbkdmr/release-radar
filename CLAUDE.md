# ReleaseRadar - Claude Code Instructions

## Project Overview

ReleaseRadar is a Node.js service that monitors tool/software versions and sends Telegram notifications when updates are detected. It also auto-publishes a companion CLI (`@lvnt/release-radar-cli`) that can be used on intranet machines to download tools through a Nexus proxy.

## Packages

- **@lvnt/release-radar** - Main service (runs on RPi, monitors versions, sends notifications)
- **@lvnt/release-radar-cli** - CLI tool (runs on intranet, downloads tools via Nexus proxy)

## Publish Command

When the user says **"publish"**, **"release"**, or **"publish it"**:

1. **Check for changes**: `git status --short`
   - If no changes, inform user "Already published" with links
2. **Bump version** in `package.json` (patch increment by default)
3. **Run tests**: `npm test`
4. **Commit**: `git add -A && git commit -m "<descriptive message>"`
5. **Push to GitHub**: `git push`
6. **Publish to npm**: `npm publish --access public`
7. **Create GitHub release**: `gh release create vX.X.X --title "vX.X.X" --notes "<changelog>"`

### Version Types

- **patch** (default): 1.2.0 → 1.2.1 (bug fixes, minor changes)
- **minor**: 1.2.0 → 1.3.0 (new features)
- **major**: 1.2.0 → 2.0.0 (breaking changes)

User can specify: "publish minor", "publish major"

### Changelog Notes

- Summarize meaningful changes since last release
- For test releases, use "Test release" or similar

## Push Without Publishing

When user says **"push to github"** or **"push it"** (without "publish"):

1. Commit changes
2. Push to GitHub
3. Do NOT bump version, publish to npm, or create release

## Key Files

### Main Service
- `src/index.ts` - Main entry point, Telegram bot commands, cron scheduling
- `src/checker.ts` - Version check orchestration
- `src/cli-publisher.ts` - Publishes CLI to npm when versions change
- `src/versions-generator.ts` - Generates versions.json for CLI
- `src/updater.ts` - Auto-updater webhook server
- `src/storage.ts` - Version data persistence
- `src/notifier.ts` - Telegram notification formatting

### CLI Package (`cli/`)
- `cli/src/index.ts` - CLI entry point
- `cli/src/downloader.ts` - wget/npm update execution
- `cli/src/ui.ts` - Interactive prompts
- `cli/src/updater.ts` - Auto-update on startup

### Configuration
- `config/tools.json` - Tools to monitor (GitHub, npm, VS Code marketplace)
- `config/downloads.json` - Download URL templates for CLI

## Telegram Commands

| Command | Description |
|---------|-------------|
| `/check` | Check all tools for updates (auto-publishes CLI if updates found) |
| `/status` | Show all tracked versions + last/next check times |
| `/interval` | Show current check interval |
| `/setinterval <hours>` | Change check interval (1-24 hours) |
| `/generate` | Generate versions.json file locally |
| `/clipreview` | Preview tools/versions that will be included in CLI |
| `/publishcli` | Manually publish CLI with current tracked versions |

## Testing

Always run `npm test` before publishing. All 59 tests must pass.

## Data Storage

- **Config files**: Loaded from package directory (`/usr/lib/node_modules/@lvnt/release-radar/config/`)
- **Data files**: Stored in `~/.release-radar/`
  - `versions.json` - Tracked version data
  - `cli/` - CLI source for publishing

## Auto-Updater Notes

- Uses `sudo npm update -g` (required for global npm packages)
- Webhook endpoint: `POST /webhook` on port 9000
- Handles both `published` and `released` GitHub actions

## CLI Publishing

When version updates are detected (or `/publishcli` triggered):
1. Generates `versions.json` with current versions + download URLs
2. Copies to `~/.release-radar/cli/`
3. Runs `npm install` and `npm run build`
4. Publishes to npm as `@lvnt/release-radar-cli`

The CLI uses `{{NEXUS_URL}}` placeholder in download URLs for security.
