# release-radar-cli

Interactive CLI for downloading development tools through a Nexus proxy. Companion tool to [@lvnt/release-radar](https://www.npmjs.com/package/@lvnt/release-radar).

## Why?

In corporate/intranet environments with restricted internet access, downloading tools directly isn't possible. This CLI:

- Downloads tools through your Nexus proxy server
- Tracks which versions you've downloaded
- Shows available updates at a glance
- Supports both wget downloads and npm global packages

## Installation

```bash
npm install -g @lvnt/release-radar-cli
```

## Quick Start

```bash
# Run interactive mode
release-radar-cli

# First run will prompt for configuration:
# - Nexus proxy URL (e.g., https://nexus.company.com/repository/raw-proxy)
# - Download directory (e.g., ~/downloads/tools)
```

## Commands

| Command | Description |
|---------|-------------|
| `release-radar-cli` | Interactive mode - select and download tools |
| `release-radar-cli status` | Show all tool versions and download status |
| `release-radar-cli config` | Configure or reconfigure settings |
| `release-radar-cli version` | Show CLI version |
| `release-radar-cli help` | Show help message |

## Options

| Option | Description |
|--------|-------------|
| `-v, --version` | Show version number |
| `-h, --help` | Show help |
| `--skip-update` | Skip auto-update check on startup |

## Interactive Mode

When you run `release-radar-cli`, you'll see a table of available tools:

```
  Tool               Latest       Downloaded   Status   Type
──────────────────────────────────────────────────────────────────────
  Claude Code CLI    1.0.17       1.0.16       UPDATE   wget
  Ninja              1.12.1       1.12.1       ✓        wget
  CMake              4.0.1        -            NEW      wget
  Ralphy             1.2.0        1.2.0        ✓        npm
```

Select tools with arrow keys and spacebar, then press Enter to download.

## Status Display

```bash
release-radar-cli status
```

Shows versions without interactive prompts - useful for scripts or quick checks.

## Configuration

Config is stored at `~/.release-radar-cli/config.json`:

```json
{
  "nexusUrl": "https://nexus.company.com/repository/raw-proxy",
  "downloadDir": "/home/user/downloads/tools"
}
```

To reconfigure:

```bash
release-radar-cli config
```

## Download Types

### wget (Binary Downloads)

Downloads files through Nexus proxy using wget:
- Claude Code CLI
- Ninja
- CMake
- Git
- Clangd
- Wezterm
- VS Code Extensions

### npm (Global Packages)

Updates npm packages globally:
- Ralphy

## Auto-Update

The CLI checks for updates on startup and automatically updates itself if a newer version is available. Skip this with `--skip-update`.

## How It Works

1. **ReleaseRadar service** monitors tool versions and publishes updates to this CLI
2. **This CLI** reads the embedded `versions.json` containing latest versions and download URLs
3. **You select** which tools to download
4. **CLI downloads** through your configured Nexus proxy

## Related

- [@lvnt/release-radar](https://www.npmjs.com/package/@lvnt/release-radar) - The monitoring service that powers this CLI

## License

ISC
