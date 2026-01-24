# ReleaseRadar - Claude Code Instructions

## Project Overview

ReleaseRadar is a Node.js service that monitors tool/software versions and sends Telegram notifications when updates are detected. It includes an auto-updater that receives GitHub webhooks to update itself.

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

- `src/index.ts` - Main entry point, bot commands, cron scheduling
- `src/updater.ts` - Auto-updater webhook server
- `src/checker.ts` - Version check orchestration
- `config/tools.json` - Tool configuration
- `package.json` - Version and dependencies

## Testing

Always run `npm test` before publishing. All 44 tests must pass.

## Auto-Updater Notes

- Uses `sudo npm update -g` (required for global npm packages)
- Webhook endpoint: `POST /webhook` on port 9000
- Handles both `published` and `released` GitHub actions
