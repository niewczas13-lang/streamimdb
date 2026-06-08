'use strict';
const { addonBuilder } = require('stremio-addon-sdk');
const { fetchVideoSource } = require('./scraper');
const { sign } = require('./proxy_token');

const BRIGHTPATH_BASE = 'https://brightpathsignals.com/embed';
const PORT = process.env.PORT || 7000;
const SERVER_BASE = (
  process.env.RENDER_EXTERNAL_URL ||
  process.env.SERVER_URL ||
  (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`) ||
  `http://localhost:${PORT}`
).replace(/\/$/, '');

const manifest = {
  id: 'org.local.streamimdb',
  version: '1.4.1',
  name: 'StreamIMDb Connector',
  description: 'Stream movies and series via streamimdb.me natively inside Stremio.',
  logo: 'https://raw.githubusercontent.com/F100Pilot/stremio-addon-streamimdb/main/icon.png',
  types: ['movie', 'series'],
  catalogs: [],
  resources: ['stream'],
  idPrefixes: ['tt']
};

const builder = new addonBuilder(manifest);

function makeHlsProxyUrl(streamUrl, referer, meta, subtitles) {
  const token = sign({ u: streamUrl, r: referer, m: meta, s: subtitles });
  return `${SERVER_BASE}/hls/${token}.m3u8`;
}

function originFromUrl(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function getStreamReferer(source, fallbackReferer) {
  return source.headers?.Referer || source.headers?.referer || source.referer || fallbackReferer;
}

const LANGUAGE_CODES = {
  arabic: 'ara',
  bulgarian: 'bul',
  chinese: 'chi',
  czech: 'cze',
  danish: 'dan',
  dutch: 'dut',
  english: 'eng',
  estonian: 'est',
  finnish: 'fin',
  french: 'fre',
  german: 'ger',
  greek: 'gre',
  hebrew: 'heb',
  hindi: 'hin',
  hungarian: 'hun',
  indonesian: 'ind',
  italian: 'ita',
  japanese: 'jpn',
  latvian: 'lav',
  lithuanian: 'lit',
  malay: 'may',
  norwegian: 'nor',
  polish: 'pol',
  portuguese: 'por',
  russian: 'rus',
  slovak: 'slo',
  slovenian: 'slv',
  spanish: 'spa',
  swedish: 'swe',
  tamil: 'tam',
  telugu: 'tel',
  thai: 'tha',
  turkish: 'tur',
  ukrainian: 'ukr',
};

function captionLang(caption) {
  const urlCode = String(caption.url || caption.id || '').match(/\/([a-z]{3})(?:-\d+)?\.(?:vtt|srt)(?:$|\?)/i)?.[1];
  if (urlCode) return urlCode.toLowerCase();

  const raw = String(caption.lang || caption.language || '').trim();
  const normalized = raw.toLowerCase().split(/[\s-]+/)[0];
  if (/^[a-z]{3}$/.test(normalized)) return normalized;
  return LANGUAGE_CODES[normalized] || raw || 'und';
}

function makeSubtitles(source) {
  if (!Array.isArray(source.captions)) return undefined;
  const preferredLangs = (process.env.SUBTITLE_LANGS || 'pol,eng')
    .split(',')
    .map(lang => lang.trim().toLowerCase())
    .filter(Boolean);

  const seen = new Set();
  const subtitles = [];
  for (const caption of source.captions) {
    if (!caption?.url) continue;
    const lang = captionLang(caption);
    const key = `${lang}:${caption.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    subtitles.push({
      id: String(caption.id || caption.url),
      url: caption.url,
      lang,
    });
  }

  const preferred = subtitles.filter(sub => preferredLangs.includes(sub.lang));
  const selected = preferred.length ? preferred : subtitles.slice(0, 8);
  return selected.length ? selected : undefined;
}

function makeStreamBehaviorHints(source, type, imdbId, referer) {
  const behaviorHints = type === 'series' ? { bingeGroup: `streamimdb-${imdbId}` } : {};
  if (source.proxyable !== false) return behaviorHints;

  const request = { ...(source.headers || {}) };
  const headerReferer = request.Referer || request.referer;
  const streamReferer = headerReferer || source.referer || referer;

  if (streamReferer && !headerReferer) request.Referer = streamReferer;
  if (!(request.Origin || request.origin)) {
    const origin = originFromUrl(streamReferer);
    if (origin) request.Origin = origin;
  }

  if (Object.keys(request).length > 0) {
    behaviorHints.proxyHeaders = { request };
    behaviorHints.notWebReady = true;
  }

  return behaviorHints;
}

builder.defineStreamHandler(async (args) => {
  try {
    const parts = args.id.split(':');
    const imdbId = parts[0];
    const type = parts.length > 1 ? 'series' : 'movie';
    const season = parts[1] || null;
    const episode = parts[2] || null;

    const referer = type === 'series'
      ? `${BRIGHTPATH_BASE}/tv/${imdbId}/${season}/${episode}`
      : `${BRIGHTPATH_BASE}/movie/${imdbId}`;

    const fallbackUrl = type === 'series'
      ? `https://streamimdb.me/embed/${imdbId}/${season}/${episode}/`
      : `https://streamimdb.me/embed/${imdbId}/`;

    let result = null;
    try {
      result = await fetchVideoSource(imdbId, type, season, episode);
    } catch (scraperErr) {
      console.error(`[handler] Erro no scraper: ${scraperErr.message}`);
    }
    // Sem retry cego aqui: re-executaria toda a cadeia e amplificava a carga.
    // A dedup/cache do scraper trata dos casos transitórios.

    if (result && result.type === 'direct') {
      const meta = { imdbId, type, season, episode };
      const streams = result.streams.flatMap(s => {
        const streamReferer = getStreamReferer(s, referer);
        const subtitles = makeSubtitles(s);
        const streamUrl = s.proxyable === false
          ? s.url
          : makeHlsProxyUrl(s.url, streamReferer, meta, subtitles);
        const behaviorHints = makeStreamBehaviorHints(s, type, imdbId, streamReferer);
        const directStream = {
          url:   streamUrl,
          name:  'StreamIMDb',
          title: type === 'series' ? `S${season}E${episode} · ${s.quality}` : s.quality,
          behaviorHints: Object.keys(behaviorHints).length ? behaviorHints : undefined,
          subtitles,
        };

        if (s.proxyable !== false || !streamReferer) return [directStream];

        const proxyBehaviorHints = type === 'series'
          ? { bingeGroup: `streamimdb-ios-${imdbId}`, notWebReady: true }
          : { notWebReady: true };

        return [directStream, {
          url: makeHlsProxyUrl(s.url, streamReferer, meta, subtitles),
          name: 'StreamIMDb iOS Proxy',
          title: type === 'series' ? `S${season}E${episode} Â· ${s.quality} Â· iOS Proxy` : `${s.quality} Â· iOS Proxy`,
          behaviorHints: proxyBehaviorHints,
          subtitles,
        }];
      });
      return { streams };
    }

    return {
      streams: [{
        externalUrl: fallbackUrl,
        name:  'StreamIMDb',
        title: 'No stream available',
      }]
    };
  } catch (err) {
    console.error(`[handler] Erro inesperado: ${err.message}`);
    return { streams: [] };
  }
});

module.exports = builder.getInterface();
