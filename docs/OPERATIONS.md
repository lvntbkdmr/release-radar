# ReleaseRadar Operations Guide

## Service Management (pm2)

### Check Status
```bash
pm2 status
```

### View Logs
```bash
# Follow logs in real-time
pm2 logs release-radar

# View last 100 lines
pm2 logs release-radar --lines 100 --nostream
```

### Stop Service
```bash
pm2 stop release-radar
```

### Start Service
```bash
pm2 start release-radar
```

### Restart Service
```bash
pm2 restart release-radar
```

### Delete Service (remove from pm2)
```bash
pm2 delete release-radar
```

### Re-deploy After Code Changes
```bash
cd /Users/lvnt/ws/ReleaseRadar
git pull
npm install
npm run build
pm2 restart release-radar
```

## Auto-Start on Boot

### Enable (run once)
```bash
sudo env PATH=$PATH:/opt/homebrew/Cellar/node/25.2.1/bin /opt/homebrew/lib/node_modules/pm2/bin/pm2 startup launchd -u lvnt --hp /Users/lvnt
```

### Save Current Process List
```bash
pm2 save
```

### Disable Auto-Start
```bash
pm2 unstartup launchd
```

## First-Time Setup on New Machine

### 1. Install Dependencies
```bash
npm install
npm install -g pm2
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your Telegram credentials
```

### 3. Build and Start
```bash
npm run build
pm2 start npm --name "release-radar" -- start
pm2 save
```

## Telegram Bot Commands

| Command | Description |
|---------|-------------|
| `/check` | Manually trigger version check for all tools |
| `/status` | Show currently tracked versions |

## Configuration

### Change Check Interval
Edit `config/tools.json`:
```json
{
  "checkIntervalHours": 6,  // Change this value
  "tools": [...]
}
```
Then restart: `pm2 restart release-radar`

### Add/Remove Tools
Edit `config/tools.json` and restart the service.

## Troubleshooting

### Service Not Starting
```bash
# Check logs for errors
pm2 logs release-radar --lines 50 --nostream

# Verify .env file exists and has correct values
cat .env
```

### Telegram Bot Not Responding
1. Verify bot token is correct in `.env`
2. Verify chat ID is correct in `.env`
3. Make sure you've started a conversation with the bot first

### Version Check Failing
```bash
# Check logs for specific tool errors
pm2 logs release-radar | grep "Failed"
```

## File Locations

| File | Purpose |
|------|---------|
| `/Users/lvnt/ws/ReleaseRadar` | Project root |
| `config/tools.json` | Tool configuration |
| `data/versions.json` | Stored version state |
| `.env` | Telegram credentials |
| `~/.pm2/logs/release-radar-*.log` | pm2 logs |
