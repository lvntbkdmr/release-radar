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

Edit `config/tools.json` to add/remove tools:

```json
{
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

#### Tool Types

| Type | Required Fields | Description |
|------|-----------------|-------------|
| `github` | `repo` | GitHub releases (e.g., `"owner/repo"`) |
| `npm` | `package` | npm registry package |
| `vscode-marketplace` | `extensionId` | VS Code extension (e.g., `"publisher.extension"`) |
| `custom` | `customFetcher` | Built-in fetchers: `vscode`, `claude-cli`, `cmake` |

## Usage

### Telegram Commands

| Command | Description |
|---------|-------------|
| `/check` | Manually trigger version check |
| `/status` | Show all tracked versions |
| `/interval` | Show current check interval |
| `/setinterval <hours>` | Set check interval (1-24 hours) |

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

When you publish a new release, the updater will automatically run `npm update -g @lvnt/release-radar` and restart the main service.

## Project Structure

```
release-radar/
├── src/
│   ├── index.ts          # Main entry point
│   ├── checker.ts        # Version check orchestration
│   ├── storage.ts        # JSON persistence
│   ├── notifier.ts       # Telegram notifications
│   ├── types.ts          # TypeScript interfaces
│   └── fetchers/
│       ├── index.ts      # Fetcher registry
│       ├── github-release.ts
│       ├── npm.ts
│       ├── vscode-marketplace.ts
│       └── custom.ts
├── config/
│   └── tools.json        # Tool configuration
├── data/
│   └── versions.json     # Persisted version state
├── docs/
│   └── OPERATIONS.md     # Operations guide
└── dist/                 # Compiled JavaScript
```

## Testing

```bash
# Run all tests
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

### Fetch Failure
```
⚠️ Failed to check CMake: Request timeout
```

## Operations

See [docs/OPERATIONS.md](docs/OPERATIONS.md) for detailed instructions on:
- Starting/stopping the service
- Viewing logs
- Auto-start configuration
- Troubleshooting

## License

ISC
