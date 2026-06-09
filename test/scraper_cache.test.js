'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

test('stream source cache defaults to 60 seconds for expiring CDN URLs', (t) => {
  const scraperPath = require.resolve('../scraper');
  const originalScraperCache = require.cache[scraperPath];
  const originalTtl = process.env.CACHE_TTL_MS;

  delete process.env.CACHE_TTL_MS;
  delete require.cache[scraperPath];

  t.after(() => {
    if (originalScraperCache) require.cache[scraperPath] = originalScraperCache;
    else delete require.cache[scraperPath];

    if (originalTtl === undefined) delete process.env.CACHE_TTL_MS;
    else process.env.CACHE_TTL_MS = originalTtl;
  });

  const { getStatus } = require('../scraper');

  assert.equal(getStatus().cache.ttlSeconds, 60);
});
