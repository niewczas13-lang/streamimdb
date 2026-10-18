'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

test('fallback links open the current StreamIMDb movie and episode players', async (t) => {
  const scraperPath = require.resolve('../scraper');
  const addonPath = require.resolve('../addon');
  const originalScraperCache = require.cache[scraperPath];
  const originalAddonCache = require.cache[addonPath];
  require.cache[scraperPath] = {
    id: scraperPath, filename: scraperPath, loaded: true,
    exports: { fetchVideoSource: async () => null },
  };
  delete require.cache[addonPath];
  t.after(() => {
    if (originalScraperCache) require.cache[scraperPath] = originalScraperCache;
    else delete require.cache[scraperPath];
    if (originalAddonCache) require.cache[addonPath] = originalAddonCache;
    else delete require.cache[addonPath];
  });

  const addon = require('../addon');
  const movie = await addon.get('stream', 'movie', 'tt0076759');
  const episode = await addon.get('stream', 'series', 'tt0903747:1:1');
  assert.equal(movie.streams[0].externalUrl, 'https://streamimdb.ru/embed/movie?imdb=tt0076759');
  assert.equal(episode.streams[0].externalUrl, 'https://streamimdb.ru/embed/tv?imdb=tt0903747&season=1&episode=1');
});

test('direct streams with referer include Stremio proxy headers', async (t) => {
  process.env.SERVER_URL = 'https://example.vercel.app';

  const scraperPath = require.resolve('../scraper');
  const addonPath = require.resolve('../addon');
  const originalScraperCache = require.cache[scraperPath];
  const originalAddonCache = require.cache[addonPath];

  require.cache[scraperPath] = {
    id: scraperPath,
    filename: scraperPath,
    loaded: true,
    exports: {
      fetchVideoSource: async () => ({
        type: 'direct',
        streams: [{
          url: 'https://cdn.example/master.m3u8',
          quality: 'Auto',
          proxyable: false,
          referer: 'https://videostr.net/',
          captions: [{
            id: 'caption-pol',
            url: 'https://subs.example/pol-29.vtt',
            language: 'Polish - Polish',
          }, {
            id: 'caption-eng',
            url: 'https://subs.example/eng-2.vtt',
            language: 'English - English',
          }, {
            id: 'caption-eng-sdh',
            url: 'https://subs.example/eng-11.vtt',
            language: 'English - English SDH',
          }, {
            id: 'caption-fre',
            url: 'https://subs.example/fre-17.vtt',
            language: 'French - French',
          }],
        }],
      }),
    },
  };
  delete require.cache[addonPath];

  t.after(() => {
    if (originalScraperCache) require.cache[scraperPath] = originalScraperCache;
    else delete require.cache[scraperPath];

    if (originalAddonCache) require.cache[addonPath] = originalAddonCache;
    else delete require.cache[addonPath];

    delete process.env.SERVER_URL;
  });

  const addon = require('../addon');
  const result = await addon.get('stream', 'series', 'tt10986410:1:1');

  assert.equal(result.cacheMaxAge, 0);
  assert.equal(result.streams.length, 1);
  assert.equal(result.streams[0].url, 'https://cdn.example/master.m3u8');
  assert.deepEqual(result.streams[0].behaviorHints.proxyHeaders, {
    request: {
      Referer: 'https://videostr.net/',
      Origin: 'https://videostr.net',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
    },
  });
  assert.equal(result.streams[0].behaviorHints.notWebReady, true);
  assert.deepEqual(result.streams[0].subtitles, [{
    id: 'caption-pol',
    url: 'https://subs.example/pol-29.vtt',
    lang: 'pol',
  }, {
    id: 'caption-eng',
    url: 'https://subs.example/eng-2.vtt',
    lang: 'eng',
  }]);

});

test('streams are always returned directly even when a source previously required the HLS proxy', async (t) => {
  const scraperPath = require.resolve('../scraper');
  const addonPath = require.resolve('../addon');
  const originalScraperCache = require.cache[scraperPath];
  const originalAddonCache = require.cache[addonPath];
  require.cache[scraperPath] = {
    id: scraperPath, filename: scraperPath, loaded: true,
    exports: {
      fetchVideoSource: async () => ({ type: 'direct', streams: [{
        url: 'https://cdn.example/master.m3u8', quality: 'Auto', proxyable: true,
        referer: 'https://player.example/', headers: { 'X-Video': 'token' },
      }, {
        url: 'https://cdn.example/video.mp4', quality: '720', proxyable: false,
      }] }),
    },
  };
  delete require.cache[addonPath];
  t.after(() => {
    if (originalScraperCache) require.cache[scraperPath] = originalScraperCache;
    else delete require.cache[scraperPath];
    if (originalAddonCache) require.cache[addonPath] = originalAddonCache;
    else delete require.cache[addonPath];
  });

  const addon = require('../addon');
  const result = await addon.get('stream', 'movie', 'tt0076759');
  assert.equal(result.streams.length, 2);
  assert.equal(result.streams[0].url, 'https://cdn.example/master.m3u8');
  assert.equal(result.streams[0].behaviorHints.proxyHeaders.request.Referer, 'https://player.example/');
  assert.equal(result.streams[0].behaviorHints.proxyHeaders.request['X-Video'], 'token');
  assert.equal(result.streams[1].url, 'https://cdn.example/video.mp4');
  assert.equal(result.streams[1].behaviorHints?.proxyHeaders, undefined);
});
