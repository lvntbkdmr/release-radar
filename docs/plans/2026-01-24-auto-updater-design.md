# Release Radar Auto-Updater Design

## Overview

A lightweight webhook receiver that listens for GitHub release events and automatically updates ReleaseRadar on the Raspberry Pi.

## Flow

```
1. Publish new version (npm publish)
2. GitHub sends webhook to Pi via Cloudflare Tunnel
3. Updater receives POST on port 9000
4. Verifies webhook signature (security)
5. Runs: npm update -g @lvnt/release-radar
6. Runs: pm2 restart release-radar
7. Sends Telegram notification: "🔄 Updated release-radar to v1.0.2"
```

## Architecture

**Components:**
- `bin/release-radar-updater.js` - CLI entry point
- `src/updater.ts` - webhook server (~50 lines)
- Reuses existing `.env` for Telegram credentials
- New env var: `GITHUB_WEBHOOK_SECRET`

**Running on Pi:**
```bash
pm2 start release-radar --name release-radar
pm2 start release-radar-updater --name release-radar-updater
```

## Implementation Details

### Webhook Server (`src/updater.ts`)

- Uses Node.js built-in `http` module (no new dependencies)
- Listens on port 9000
- Single endpoint: `POST /webhook`

**Request handling:**
1. Verify `X-Hub-Signature-256` header using HMAC-SHA256 with secret
2. Parse JSON body, check for `release` event with `action: "published"`
3. Ignore other events (push, issues, etc.)

**Update process:**
```typescript
spawn('npm', ['update', '-g', '@lvnt/release-radar'], { stdio: 'inherit' })
  .on('close', (code) => {
    if (code === 0) {
      spawn('pm2', ['restart', 'release-radar']);
      sendTelegramNotification(`🔄 Updated release-radar to v${newVersion}`);
    } else {
      sendTelegramNotification(`⚠️ Failed to update release-radar`);
    }
  });
```

### Environment Variables

Added to `.env`:
```
GITHUB_WEBHOOK_SECRET=your_secret_here
UPDATER_PORT=9000  # optional, defaults to 9000
```

## GitHub & Cloudflare Setup

### GitHub Webhook Configuration

1. Go to `github.com/lvntbkdmr/release-radar/settings/hooks`
2. Add webhook:
   - **Payload URL**: `https://your-tunnel-domain.com/webhook`
   - **Content type**: `application/json`
   - **Secret**: Generate a strong secret (same as `GITHUB_WEBHOOK_SECRET`)
   - **Events**: Select "Releases" only

### Cloudflare Tunnel

Add a public hostname route:
```yaml
- hostname: rr-updater.yourdomain.com
  service: http://localhost:9000
```

### Security

- Webhook secret prevents unauthorized triggers
- Only responds to `release.published` events
- Only updates the specific package, not arbitrary code execution

## Packaging

**package.json changes:**
```json
{
  "bin": {
    "release-radar": "bin/release-radar.js",
    "release-radar-updater": "bin/release-radar-updater.js"
  }
}
```

**New files:**
```
bin/release-radar-updater.js    # CLI entry point
src/updater.ts                  # Webhook server
src/updater.test.ts             # Tests for signature verification
```

## Deployment

```bash
# Install/update (gets both binaries)
npm update -g @lvnt/release-radar

# Add updater to pm2 (one-time)
cd ~/release-radar
pm2 start release-radar-updater --name release-radar-updater
pm2 save
```

## Version

This will be released as v1.1.0 (new feature).
