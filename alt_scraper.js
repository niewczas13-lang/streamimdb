'use strict';
const axios = require('axios');
const { STREAMIMDB_BASE, streamImdbEmbedUrl } = require('./streamimdb');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const TIMEOUT = 12000;

function extractM3u8(text) {
  const m = text.match(/https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*/);
  return m ? m[0] : null;
}

function extractSources(body) {
  try {
    const m = body.match(/"sources"\s*:\s*(\[[\s\S]*?\])/);
    if (m) {
      const sources = JSON.parse(m[1]);
      return sources
        .map(s => ({ url: s.file || s.src || s.url, quality: s.label || s.type || 'Auto' }))
        .filter(s => s.url && (s.url.includes('.m3u8') || s.url.includes('.mp4')));
    }
  } catch {}
  return [];
}

// Extrai iframe src do StreamIMDb e segue para o CDN
async function tryStreamImdb(imdbId, type, season, episode) {
  const embedUrl = streamImdbEmbedUrl(imdbId, type, season, episode);

  try {
    const embedRes = await axios.get(embedUrl, {
      timeout: TIMEOUT,
      headers: { 'User-Agent': UA },
      validateStatus: s => s < 500,
    });

    const embedBody = typeof embedRes.data === 'string' ? embedRes.data : '';

    // Extrai o src do iframe player
    const playerIframe = embedBody.match(/<iframe\b[^>]*\bid\s*=\s*["'](?:pf|player_iframe)["'][^>]*>/i)?.[0];
    const iframeMatch = playerIframe?.match(/\bsrc\s*=\s*(["'])(.*?)\1/i);
    if (!iframeMatch) {
      console.log('[alt] streamimdb: iframe não encontrado');
      return null;
    }

    let iframeSrc = iframeMatch[2].replace(/&amp;/g, '&').trim();
    try {
      iframeSrc = new URL(iframeSrc, embedUrl).href;
    } catch {
      console.log(`[alt] streamimdb: iframe URL inválido: ${iframeSrc}`);
      return null;
    }
    console.log(`[alt] streamimdb iframe → ${iframeSrc.substring(0, 80)}...`);

    // Segue o iframe para o CDN
    const iframeRes = await axios.get(iframeSrc, {
      timeout: TIMEOUT,
      headers: {
        'User-Agent': UA,
        'Referer': embedUrl,
        'Origin': STREAMIMDB_BASE,
      },
      maxRedirects: 10,
      validateStatus: s => s < 500,
    });

    const finalUrl = iframeRes.request?.res?.responseUrl || iframeRes.request?.responseURL || '';
    if (finalUrl && finalUrl.includes('.m3u8')) {
      console.log('[alt] streamimdb: redirect directo para m3u8');
      return [{ url: finalUrl, quality: 'Auto', referer: iframeSrc }];
    }

    const iframeBody = typeof iframeRes.data === 'string' ? iframeRes.data : JSON.stringify(iframeRes.data);

    const sources = extractSources(iframeBody);
    if (sources.length) {
      console.log(`[alt] streamimdb: ${sources.length} fontes encontradas`);
      return sources.map(source => ({ ...source, referer: iframeSrc }));
    }

    const m3u8 = extractM3u8(iframeBody);
    if (m3u8) {
      console.log('[alt] streamimdb: m3u8 encontrado');
      return [{ url: m3u8, quality: 'Auto', referer: iframeSrc }];
    }

    // Tenta seguir um segundo nível (o CDN pode redirecionar para outro iframe)
    const nestedIframe = iframeBody.match(/src="(https?:\/\/[^"]+)"/);
    if (nestedIframe && !nestedIframe[1].includes('cdnjs') && !nestedIframe[1].includes('cloudflare')) {
      const nested = await axios.get(nestedIframe[1], {
        timeout: TIMEOUT,
        headers: { 'User-Agent': UA, 'Referer': iframeSrc },
        maxRedirects: 10,
        validateStatus: s => s < 500,
      });
      const nestedBody = typeof nested.data === 'string' ? nested.data : JSON.stringify(nested.data);
      const nestedSources = extractSources(nestedBody);
      if (nestedSources.length) {
        console.log(`[alt] streamimdb nested: ${nestedSources.length} fontes`);
        return nestedSources.map(source => ({ ...source, referer: nestedIframe[1] }));
      }
      const nestedM3u8 = extractM3u8(nestedBody);
      if (nestedM3u8) {
        console.log('[alt] streamimdb nested: m3u8 encontrado');
        return [{ url: nestedM3u8, quality: 'Auto', referer: nestedIframe[1] }];
      }
    }

    console.log('[alt] streamimdb: sem stream encontrado');

  } catch (e) {
    console.log(`[alt] streamimdb: ${e.message}`);
  }
  return null;
}

// multiembed.mov - redireciona directamente para stream
async function tryMultiEmbed(imdbId, type, season, episode) {
  let url = type === 'series'
    ? `https://multiembed.mov/directstream.php?video_id=${imdbId}&s=${season}&e=${episode}`
    : `https://multiembed.mov/directstream.php?video_id=${imdbId}`;

  try {
    const res = await axios.get(url, {
      timeout: TIMEOUT,
      maxRedirects: 10,
      headers: { 'User-Agent': UA, 'Referer': 'https://multiembed.mov/' },
      validateStatus: s => s < 500,
    });

    const finalUrl = res.request?.res?.responseUrl || res.request?.responseURL || '';
    if (finalUrl.includes('.m3u8')) {
      console.log('[alt] multiembed redirect → m3u8');
      return [{ url: finalUrl, quality: 'Auto' }];
    }

    const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    const sources = extractSources(body);
    if (sources.length) { console.log(`[alt] multiembed: ${sources.length} fontes`); return sources; }

    const m3u8 = extractM3u8(body);
    if (m3u8) { console.log('[alt] multiembed: m3u8 encontrado'); return [{ url: m3u8, quality: 'Auto' }]; }

  } catch (e) {
    console.log(`[alt] multiembed: ${e.message}`);
  }
  return null;
}

async function fetchFromAltSources(imdbId, type, season, episode) {
  // StreamIMDb: pode exigir Turnstile no browser, sem fonte HTTP directa.
  const result = await tryStreamImdb(imdbId, type, season, episode);
  if (result && result.length > 0) return result;

  // multiembed como segunda opção
  const result2 = await tryMultiEmbed(imdbId, type, season, episode);
  if (result2 && result2.length > 0) return result2;

  return null;
}

module.exports = { fetchFromAltSources };
