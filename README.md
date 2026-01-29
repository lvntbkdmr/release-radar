# ReleaseRadar

A Node.js service that monitors tool/software versions and sends Telegram notifications when updates are detected.

Built for environments with limited internet access (e.g., intranet) where manual version checking is tedious.

## Features

- Monitors 15+ tools from various sources:
  - GitHub Releases
  - npm Registry
  - VS Code Marketplace
  - Custom APIs (VSCode, Claude Code CLI, CMake)
- Sends Telegram notifications on version changes
- Batched notifications (multiple updates in one message)
- Periodic checks via cron (configurable interval)
- Manual check via Telegram `/check` command
- Persistent version storage (survives restarts)
- **Auto-publishes companion CLI** when updates are detected

## Packages

| Package | Description |
|---------|-------------|
| [@lvnt/release-radar](https://www.npmjs.com/package/@lvnt/release-radar) | Main service - monitors versions, sends notifications |
| [@lvnt/release-radar-cli](https://www.npmjs.com/package/@lvnt/release-radar-cli) | Companion CLI - download tools through Nexus proxy |

## Tracked Tools

| Tool | Source |
|------|--------|
| VSCode | VS Code Update API |
| Claude Code CLI | Google Storage / GitHub |
| Ninja | GitHub |
| CMake | cmake.org |
| Git | GitHub (git-for-windows) |
| Clangd | GitHub |
| Wezterm | GitHub |
| Ralphy | npm |
| vscode-cpptools | GitHub |
| vscode-clangd | GitHub |
| Claude Code VSCode | VS Code Marketplace |
| CMake Tools | GitHub |
| Roo Code | GitHub |
| Atlascode | GitHub |
| Zed | GitHub |

## Prerequisites

- Node.js 18+
- Telegram Bot Token (from [@BotFather](https://t.me/botfather))
- Telegram Chat ID (your user ID or group ID)

## Installation

### From npm (recommended)

```bash
# Install globally
npm install -g @lvnt/release-radar

# Create a directory for config and data
mkdir ~/release-radar && cd ~/release-radar

# First run creates config files (.env and config/tools.json)
release-radar

# Edit .env with your Telegram credentials
nano .env

# Run again
release-radar
```

### With pm2 (recommended for production)

```bash
cd ~/release-radar
pm2 start release-radar --name release-radar
pm2 save
pm2 startup  # Enable auto-start on boot
```

### From source (for development)

```bash
# Clone the repository
git clone https://github.com/lvntbkdmr/release-radar.git
cd release-radar

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your Telegram credentials

# Build and run
npm run build
npm start
```

## Configuration

### Environment Variables

Create a `.env` file:

```env
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here
```

### Tools Configuration

Edit `config/tools.json` to add/remove tools and configure scheduling:

```json
{
  "scheduleMode": "daily",
  "dailyCheckTime": "06:00",
  "checkIntervalHours": 6,
  "tools": [
    {
      "name": "MyTool",
      "type": "github",
      "repo": "owner/repo"
    }
  ]
}
```

#### Schedule Options

| Field | Values | Description |
|-------|--------|-------------|
| `scheduleMode` | `"daily"` or `"interval"` | Check once per day or every N hours |
| `dailyCheckTime` | `"HH:MM"` | Time for daily check (24-hour format, e.g., `"06:00"`) |
| `checkIntervalHours` | `1-24` | Hours between checks (interval mode) |

#### Tool Types

| Type | Required Fields | Description |
|------|-----------------|-------------|
| `github` | `repo` | GitHub releases (e.g., `"owner/repo"`) |
| `npm` | `package` | npm registry package |
| `vscode-marketplace` | `extensionId` | VS Code extension (e.g., `"publisher.extension"`) |
| `custom` | `customFetcher` | Built-in fetchers: `vscode`, `claude-cli`, `cmake` |

### Downloads Configuration

Edit `config/downloads.json` to configure CLI download URLs:

```json
{
  "ninja": {
    "displayName": "Ninja",
    "downloadUrl": "https://github.com/ninja-build/ninja/releases/download/v{{VERSION}}/ninja-win.zip",
    "filename": "ninja-{{VERSION}}.zip"
  },
  "ralphy": {
    "type": "npm",
    "displayName": "Ralphy",
    "package": "ralphy"
  }
}
```

Placeholders:
- `{{VERSION}}` - Full version (e.g., `2.52.0.windows.1`)
- `{{VERSION_BASE}}` - Base semver (e.g., `2.52.0`)
- `{{NEXUS_URL}}` - Replaced by CLI with user's Nexus URL

## Usage

### Telegram Commands

| Command | Description |
|---------|-------------|
| `/check` | Manually trigger version check (auto-publishes CLI if updates found) |
| `/status` | Show all tracked versions + last/next check times |
| `/schedule` | Show current schedule mode and next check time |
| `/settime <HH:MM>` | Set daily check time (e.g., `/settime 06:00`) and switch to daily mode |
| `/setmode <daily\|interval>` | Switch between daily and interval modes |
| `/interval` | Show current check interval (interval mode) |
| `/setinterval <hours>` | Set check interval (1-24 hours) and switch to interval mode |
| `/generate` | Generate versions.json file locally |
| `/clipreview` | Preview tools/versions that will be included in CLI |
| `/publishcli` | Manually publish CLI with current tracked versions |

## Companion CLI

The companion CLI (`@lvnt/release-radar-cli`) allows users on intranet machines to download tracked tools through a Nexus proxy.

### How It Works

1. **ReleaseRadar** monitors tool versions
2. When updates are detected, it **auto-publishes** the CLI with new versions
3. Users run `release-radar-cli` on their machines
4. CLI shows available tools and downloads through configured Nexus proxy

### CLI Installation

```bash
npm install -g @lvnt/release-radar-cli
release-radar-cli
```

See [@lvnt/release-radar-cli](https://www.npmjs.com/package/@lvnt/release-radar-cli) for full documentation.

## Auto-Updater (Optional)

ReleaseRadar includes an optional auto-updater that receives GitHub webhooks and automatically updates itself when you publish a new version.

### Setup

1. Add to your `.env`:
   ```env
   GITHUB_WEBHOOK_SECRET=your_secret_here
   UPDATER_PORT=9000
   ```

2. Configure GitHub webhook:
   - Go to your repo's Settings → Webhooks → Add webhook
   - Payload URL: `https://your-domain.com/webhook`
   - Content type: `application/json`
   - Secret: same as `GITHUB_WEBHOOK_SECRET`
   - Events: Select "Releases" only

3. Start the updater with pm2:
   ```bash
   pm2 start release-radar-updater --name release-radar-updater
   pm2 save
   ```

When you publish a new release, the updater will automatically run `sudo npm update -g @lvnt/release-radar` and restart the main service.

**Note:** If you installed npm with sudo, configure passwordless sudo for npm:
```bash
sudo visudo
# Add this line:
# yourusername ALL=(ALL) NOPASSWD: /usr/bin/npm
```

## Data Storage

| Location | Contents |
|----------|----------|
| Package directory (`config/`) | `tools.json`, `downloads.json` (read-only config) |
| `~/.release-radar/` | `versions.json` (tracked versions), `cli/` (CLI source for publishing) |

## Project Structure

```
release-radar/
├── src/
│   ├── index.ts          # Main entry point, Telegram bot
│   ├── checker.ts        # Version check orchestration
│   ├── storage.ts        # JSON persistence
│   ├── notifier.ts       # Telegram notifications
│   ├── cli-publisher.ts  # CLI auto-publishing
│   ├── versions-generator.ts  # Generate versions.json
│   ├── types.ts          # TypeScript interfaces
│   └── fetchers/
│       ├── index.ts      # Fetcher registry
│       ├── github-release.ts
│       ├── npm.ts
│       ├── vscode-marketplace.ts
│       └── custom.ts
├── cli/                  # Companion CLI source
│   ├── src/
│   │   ├── index.ts      # CLI entry point
│   │   ├── downloader.ts # wget/npm execution
│   │   ├── ui.ts         # Interactive prompts
│   │   └── updater.ts    # Auto-update
│   └── versions.json     # Embedded version data
├── config/
│   ├── tools.json        # Tools to monitor
│   └── downloads.json    # Download URL templates
└── dist/                 # Compiled JavaScript
```

## Testing

```bash
# Run all tests (59 tests)
npm test

# Watch mode
npm run test:watch
```

## Notifications

### Version Update
```
🔄 Ninja: 1.11.1 → 1.12.0
🔄 Git: 2.43.0 → 2.44.0
```

### CLI Published
```
📦 CLI published: v0.2.8
```

### Fetch Failure
```
⚠️ Failed to check CMake: Request timeout
```

## License

ISC
