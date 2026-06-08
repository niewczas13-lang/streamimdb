'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const { fetchFromAltSources } = require('../alt_scraper');

test('resolves relative streamimdb iframe URLs against the embed page', async (t) => {
  const originalGet = axios.get;
  const calls = [];

  axios.get = async (url) => {
    calls.push(url);

    if (url === 'https://streamimdb.me/embed/tt10986410/1/1/') {
      return {
        data: '<iframe id="player_iframe" src="/embed/tv?imdb=tt10986410&season=1&episode=1&color=e600e6"></iframe>',
        request: { res: { responseUrl: url } },
      };
    }

    if (url === 'https://streamimdb.me/embed/tv?imdb=tt10986410&season=1&episode=1&color=e600e6') {
      return {
        data: 'file: "https://cdn.example/master.m3u8"',
        request: { res: { responseUrl: url } },
      };
    }

    if (url.startsWith('https://multiembed.mov/')) {
      return {
        data: '',
        request: { res: { responseUrl: url } },
      };
    }

    throw new Error(`unexpected URL: ${url}`);
  };

  t.after(() => {
    axios.get = originalGet;
  });

  const streams = await fetchFromAltSources('tt10986410', 'series', '1', '1');

  assert.deepEqual(streams, [{ url: 'https://cdn.example/master.m3u8', quality: 'Auto' }]);
  assert.equal(
    calls[1],
    'https://streamimdb.me/embed/tv?imdb=tt10986410&season=1&episode=1&color=e600e6',
  );
});
