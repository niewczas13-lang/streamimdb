# StreamIMDb Connector — Stremio Add-on

A Stremio add-on that fetches `.m3u8` video streams via a direct API call and plays them natively inside Stremio, without opening a browser.

## Features

- **Best quality stream** — always selects the highest available variant (4K → 1080p → 720p → …)
- **HLS proxy** — all segments are served through the add-on server with correct headers, eliminating CDN buffering
- **Auto CDN fallback** — tests all available CDN sources in parallel, picks the first working one
- **Binge watching** — next episode screen appears at the end of each episode
- **Health monitoring** — automatic periodic checks of the upstream API with webhook/email alerts
- **Fast & lightweight** — pure HTTP, no browser, <5s response time, ~5MB RAM per request

## How it works

1. You click on a movie or series in Stremio
2. The add-on receives the IMDb ID (e.g. `tt0076759`)
3. It calls `streamdata.vaplayer.ru/api.php` directly (no browser, pure HTTP)
4. The API returns a list of `.m3u8` stream URLs tested in parallel
5. The HLS master playlist is parsed and the highest quality variant is selected
6. All segments are proxied through the server with the required `Referer`/`Origin` headers

## Requirements

- [Node.js](https://nodejs.org) v18+
- Windows, macOS or Linux

## Installation

```bash
git clone https://github.com/F100Pilot/stremio-addon-streamimdb.git
cd stremio-addon-streamimdb
npm install
```

## Usage

```bash
node server.js
```

The server starts at `http://localhost:7000`.

To install in Stremio, open Stremio and add the add-on using this URL:
```
http://localhost:7000/manifest.json
```

Or visit `http://localhost:7000` for the install page.

## Performance

| | v1.0 (Puppeteer) | v1.1 (API direct) |
|---|---|---|
| Response time | ~25s | <5s |
| RAM per request | ~150 MB | ~5 MB |
| Simultaneous users | 1–2 | Unlimited |
| Quality selection | Best only | Best only (highest bandwidth) |

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `VAPLAYER_API_URL` | `https://streamdata.vaplayer.ru/api.php` | Upstream stream API |
| `CACHE_TTL_MS` | `900000` (15min) | Stream URL cache duration |
| `MAX_QUEUE` | `8` | Max concurrent scrape requests |
| `RENDER_EXTERNAL_URL` | — | Auto-set by Render — used for HLS proxy URLs |
| `SERVER_URL` | — | Override server base URL (local/self-hosted) |
| `HEALTH_CHECK_INTERVAL_MS` | `300000` (5min) | Health check frequency |
| `ALERT_WEBHOOK` | — | Slack/Discord webhook URL for alerts |
| `ALERT_EMAIL` | — | Email address for alerts |

## Project structure

```
server.js   — HTTP server (port 7000) + landing page + HLS proxy + /health endpoint
addon.js    — Stremio SDK manifest and stream handler
scraper.js  — API fetch, quality parsing, cache, dedup and queue protection
health.js   — Periodic API health checks and alert system
```

## Troubleshooting

### Android — stream not playing or player error

On Stremio Android, the default **ExoPlayer** may fail to play HLS streams served through a proxy. Switch to **VLC** in Stremio settings:

> Stremio → Settings → Player → Change player to **VLC**

This resolves playback issues on Android.
