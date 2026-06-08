'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

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

  assert.equal(result.streams.length, 2);
  assert.equal(result.streams[0].url, 'https://cdn.example/master.m3u8');
  assert.deepEqual(result.streams[0].behaviorHints.proxyHeaders, {
    request: {
      Referer: 'https://videostr.net/',
      Origin: 'https://videostr.net',
    },
  });
  assert.equal(result.streams[0].behaviorHints.notWebReady, true);

  assert.equal(result.streams[1].name, 'StreamIMDb iOS Proxy');
  assert.match(result.streams[1].url, /^https:\/\/example\.vercel\.app\/hls\/.+\.m3u8$/);
  assert.equal(result.streams[1].behaviorHints.proxyHeaders, undefined);
  assert.equal(result.streams[1].behaviorHints.notWebReady, true);
});
