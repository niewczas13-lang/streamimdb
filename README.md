# StreamIMDb Connector — Stremio Add-on

A Stremio add-on that resolves direct MP4 and HLS URLs. Vercel hosts the add-on
manifest and stream metadata; Stremio downloads video directly from the provider.

## Features

- **Best quality stream** — always selects the highest available variant (4K → 1080p → 720p → …)
- **Direct playback** — video does not pass through Vercel; required provider headers are returned to Stremio
- **Source fallback** — Vidlink (MP4 or HLS), followed by VixSrc and the remaining fallbacks
- **Binge watching** — next episode screen appears at the end of each episode
- **Health monitoring** — automatic periodic checks of the upstream API with webhook/email alerts
- **Fast & lightweight** — pure HTTP, no browser, <5s response time, ~5MB RAM per request

## How it works

1. You click on a movie or series in Stremio
2. The add-on receives the IMDb ID (e.g. `tt0076759`)
3. It uses `TMDB_API_KEY` to resolve the TMDB ID required by Vidlink and VixSrc
4. Vidlink returns an HLS playlist or a set of MP4 file qualities; the add-on selects the highest available file quality
5. The add-on returns the provider URL, captions, and any required request headers as JSON
6. Stremio fetches the video directly from the provider; Vercel does not relay it

On Vercel, the legacy `/hls`, `/seg`, `/subs`, and `/sub` proxy routes return 404.
The add-on does not generate proxy playback entries. MP4 sources without required
headers receive no invented `Referer` or `Origin`; the current file CDN rejects
the player `Referer` with HTTP 429.

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
| `TMDB_API_KEY` | — | Required TMDB API key for IMDb → TMDB lookup; set for Production on Vercel |
| `CACHE_TTL_MS` | `60000` (1min) | Stream URL cache duration |
| `MAX_QUEUE` | `8` | Max concurrent scrape requests |
| `SERVER_URL` | — | Stable public add-on URL, e.g. `https://streamimdb-ten.vercel.app` |
| `HEALTH_CHECK_INTERVAL_MS` | `300000` (5min) | Health check frequency |
| `ALERT_WEBHOOK` | — | Slack/Discord webhook URL for alerts |
| `ALERT_EMAIL` | — | Email address for alerts |

## Project structure

```
server.js             — Express app, landing page, /health; media proxy routes disabled on Vercel
addon.js              — Stremio manifest and direct stream responses
datacenter_scraper.js — Vidlink MP4/HLS and VixSrc integration
streamimdb.js         — Shared current StreamIMDb embed URLs
scraper.js            — Source fallback, cache, dedup and queue protection
health.js             — Periodic API health checks and alert system
```

## Troubleshooting

### StreamIMDb domain and unavailable sources

The StreamIMDb integration uses `https://streamimdb.ru`, with
`/embed/movie?imdb=...` for movies and
`/embed/tv?imdb=...&season=...&episode=...` for episodes. The scraper and
browser fallback share these URLs in `streamimdb.js`.

The embedded provider may return a Cloudflare Turnstile page instead of a
video source. The HTTP scraper cannot resolve that browser challenge; updating
the domain alone does not restore native playback in that case. If no provider
returns a stream, the add-on offers the current StreamIMDb player as an external
browser link. VixSrc and Vidlink still require `TMDB_API_KEY`.

### Android — stream not playing or player error

On Stremio Android, the default **ExoPlayer** may fail to play HLS streams served through a proxy. Switch to **VLC** in Stremio settings:

> Stremio → Settings → Player → Change player to **VLC**

This resolves playback issues on Android.
