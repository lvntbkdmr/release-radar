# ReleaseRadar Design

A backend service that monitors version updates for development tools and notifies via Telegram.

## Problem

Working in an air-gapped intranet environment requires manually checking for tool updates. This service automates that monitoring and sends notifications when updates are available.

## Technology Stack

- **Runtime**: Node.js with TypeScript
- **Storage**: JSON file
- **Notifications**: Telegram bot
- **Deployment**: Home server/Raspberry Pi with systemd

## Project Structure

```
ReleaseRadar/
├── src/
│   ├── index.ts              # Entry point, initializes bot & scheduler
│   ├── checker.ts            # Orchestrates checking all tools
│   ├── notifier.ts           # Telegram bot wrapper
│   ├── storage.ts            # JSON file read/write for versions
│   └── fetchers/
│       ├── index.ts          # Fetcher registry
│       ├── github-release.ts # GitHub API releases
│       ├── npm.ts            # npm registry
│       ├── vscode-marketplace.ts
│       └── custom.ts         # VSCode API, CMake HTML parsing, etc.
├── config/
│   └── tools.json            # List of tools to track
├── data/
│   └── versions.json         # Current known versions (auto-managed)
├── package.json
└── tsconfig.json
```

## Configuration

### `config/tools.json`

```json
{
  "checkIntervalHours": 6,
  "tools": [
    {
      "name": "VSCode",
      "type": "custom",
      "url": "https://update.code.visualstudio.com/api/releases/stable"
    },
    {
      "name": "Claude Code CLI",
      "type": "custom",
      "url": "https://storage.googleapis.com/claude-code-dist-86c565f3-f756-42ad-8dfa-d59b1c096819/claude-code-releases/latest",
      "fallbackUrl": "https://api.github.com/repos/anthropics/claude-code/releases/latest"
    },
    {
      "name": "Ninja",
      "type": "github",
      "repo": "ninja-build/ninja"
    },
    {
      "name": "Git",
      "type": "github",
      "repo": "git-for-windows/git"
    },
    {
      "name": "Ralphy",
      "type": "npm",
      "package": "ralphy-cli"
    },
    {
      "name": "Claude Code VSCode",
      "type": "vscode-marketplace",
      "extensionId": "anthropic.claude-code"
    }
  ]
}
```

### Environment Variables

```
TELEGRAM_BOT_TOKEN=<from @BotFather>
TELEGRAM_CHAT_ID=<your chat ID>
```

## Fetcher Types

| Type | Source | Version Extraction |
|------|--------|-------------------|
| `github` | GitHub Releases API | `tag_name` field, strips leading "v" |
| `npm` | npm registry | `npm view {package} version` |
| `vscode-marketplace` | VS Code Gallery API | Parses version from response |
| `custom` | Various URLs | Tool-specific parsing logic |

### Custom Fetcher Implementations

- **VSCode**: JSON array from update API, returns first element
- **Claude Code CLI**: Plain text file containing version string
- **CMake**: HTML directory listing, parses filenames for version

## Telegram Bot

### Commands

- `/check` - Trigger immediate check of all tools
- `/status` - List all tracked tools with current known versions

### Notification Format

Update detected:
```
🔄 Ninja: 1.11.1 → 1.12.0
```

Check failure:
```
⚠️ Failed to check CMake: Request timeout
```

Multiple updates/failures are batched into a single message.

## Storage

### `data/versions.json`

```json
{
  "lastCheck": "2026-01-23T10:30:00Z",
  "versions": {
    "VSCode": "1.96.0",
    "Claude Code CLI": "1.0.5",
    "Ninja": "1.12.0"
  }
}
```

### Behavior

- First run: stores version without notifying (no previous version to compare)
- Writes atomically (temp file + rename) to prevent corruption
- New tools added to config are treated as first run

## Deployment

### systemd Service

`/etc/systemd/system/release-radar.service`:

```ini
[Unit]
Description=ReleaseRadar Update Checker
After=network-online.target

[Service]
WorkingDirectory=/home/pi/ReleaseRadar
ExecStart=/usr/bin/node dist/index.js
Restart=always
EnvironmentFile=/home/pi/ReleaseRadar/.env

[Install]
WantedBy=multi-user.target
```

### Dependencies

- `node-telegram-bot-api` - Telegram integration
- `node-cron` - Scheduling
- `typescript`, `tsx` - Development

## Tools to Track

1. VSCode (custom API)
2. Claude Code CLI (custom + GitHub fallback)
3. Ninja (GitHub)
4. CMake (custom HTML parsing)
5. Git for Windows (GitHub)
6. Clangd (GitHub)
7. Wezterm (GitHub)
8. Ralphy (npm)
9. vscode-cpptools (GitHub)
10. vscode-clangd (GitHub)
11. Claude Code VSCode (VS Code Marketplace)
12. CMake Tools (GitHub)
13. Roo Code (GitHub)
14. Atlascode (GitHub)
15. Zed (GitHub)
