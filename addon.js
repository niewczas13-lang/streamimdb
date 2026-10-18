'use strict';
const { addonBuilder } = require('stremio-addon-sdk');
const { fetchVideoSource } = require('./scraper');
const { streamImdbEmbedUrl } = require('./streamimdb');

const manifest = {
  id: 'org.local.streamimdb',
  version: '1.4.1',
  name: 'StreamIMDb Connector',
  description: 'Stream movies and series via streamimdb.ru natively inside Stremio.',
  logo: 'https://raw.githubusercontent.com/F100Pilot/stremio-addon-streamimdb/main/icon.png',
  types: ['movie', 'series'],
  catalogs: [],
  resources: ['stream'],
  idPrefixes: ['tt']
};

const builder = new addonBuilder(manifest);

const STREAM_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';

function originFromUrl(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function getStreamReferer(source) {
  return source.headers?.Referer || source.headers?.referer || source.referer;
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

  const preferred = subtitles
    .filter(sub => preferredLangs.includes(sub.lang))
    .sort((a, b) => preferredLangs.indexOf(a.lang) - preferredLangs.indexOf(b.lang));
  const selected = preferred.length ? preferred : subtitles.slice(0, 8);
  const seenLangs = new Set();
  const uniqueByLang = selected.filter(sub => {
    if (seenLangs.has(sub.lang)) return false;
    seenLangs.add(sub.lang);
    return true;
  });

  return uniqueByLang.length ? uniqueByLang : undefined;
}

function makeStreamBehaviorHints(source, type, imdbId, referer) {
  const behaviorHints = type === 'series' ? { bingeGroup: `streamimdb-${imdbId}` } : {};
  const request = { ...(source.headers || {}) };
  const headerReferer = request.Referer || request.referer;
  const streamReferer = headerReferer || source.referer || referer;
  if (!streamReferer && Object.keys(request).length === 0) return behaviorHints;

  if (streamReferer && !headerReferer) request.Referer = streamReferer;
  if (!(request.Origin || request.origin)) {
    const origin = originFromUrl(streamReferer);
    if (origin) request.Origin = origin;
  }
  if (!(request['User-Agent'] || request['user-agent'])) request['User-Agent'] = STREAM_UA;

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

    const fallbackUrl = streamImdbEmbedUrl(imdbId, type, season, episode);

    let result = null;
    try {
      result = await fetchVideoSource(imdbId, type, season, episode);
    } catch (scraperErr) {
      console.error(`[handler] Erro no scraper: ${scraperErr.message}`);
    }
    // Sem retry cego aqui: re-executaria toda a cadeia e amplificava a carga.
    // A dedup/cache do scraper trata dos casos transitórios.

    if (result && result.type === 'direct') {
      const streams = result.streams.map(s => {
        const streamReferer = getStreamReferer(s);
        const subtitles = makeSubtitles(s);
        const behaviorHints = makeStreamBehaviorHints(s, type, imdbId, streamReferer);
        return {
          url:   s.url,
          name:  'StreamIMDb',
          title: type === 'series' ? `S${season}E${episode} · ${s.quality}` : s.quality,
          behaviorHints: Object.keys(behaviorHints).length ? behaviorHints : undefined,
          subtitles,
        };
      });
      return { streams, cacheMaxAge: 0 };
    }

    return {
      cacheMaxAge: 0,
      streams: [{
        externalUrl: fallbackUrl,
        name:  'StreamIMDb',
        title: 'No stream available',
      }]
    };
  } catch (err) {
    console.error(`[handler] Erro inesperado: ${err.message}`);
    return { streams: [], cacheMaxAge: 0 };
  }
});

module.exports = builder.getInterface();
