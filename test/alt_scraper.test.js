'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const { fetchFromAltSources } = require('../alt_scraper');

test('resolves the current StreamIMDb player iframe and decodes episode query parameters', async (t) => {
  const originalGet = axios.get;
  const calls = [];

  axios.get = async (url, options) => {
    calls.push({ url, options });

    if (url === 'https://streamimdb.ru/embed/tv?imdb=tt10986410&season=1&episode=1') {
      return {
        data: '<iframe src="/player?imdb=tt10986410&amp;season=1&amp;episode=1" id="pf" allowfullscreen></iframe>',
        request: { res: { responseUrl: url } },
      };
    }

    if (url === 'https://streamimdb.ru/player?imdb=tt10986410&season=1&episode=1') {
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

  assert.deepEqual(streams, [{
    url: 'https://cdn.example/master.m3u8',
    quality: 'Auto',
    referer: 'https://streamimdb.ru/player?imdb=tt10986410&season=1&episode=1',
  }]);
  assert.equal(
    calls[1].url,
    'https://streamimdb.ru/player?imdb=tt10986410&season=1&episode=1',
  );
  assert.equal(calls[1].options.headers.Origin, 'https://streamimdb.ru');
  assert.equal(calls[1].options.headers.Referer, 'https://streamimdb.ru/embed/tv?imdb=tt10986410&season=1&episode=1');
});

test('accepts the legacy player iframe id and preserves the CDN referer for movie streams', async (t) => {
  const originalGet = axios.get;
  t.after(() => { axios.get = originalGet; });

  axios.get = async (url) => {
    if (url === 'https://streamimdb.ru/embed/movie?imdb=tt0076759') {
      return { data: "<iframe id='player_iframe' src='https://cdn.example/player'></iframe>" };
    }
    if (url === 'https://cdn.example/player') {
      return { data: '{"sources":[{"file":"https://cdn.example/video.m3u8","label":"1080p"}]}' };
    }
    throw new Error(`unexpected URL: ${url}`);
  };

  assert.deepEqual(await fetchFromAltSources('tt0076759', 'movie'), [{
    url: 'https://cdn.example/video.m3u8', quality: '1080p', referer: 'https://cdn.example/player',
  }]);
});

test('does not treat a Turnstile challenge script as a nested player or stream', async (t) => {
  const originalGet = axios.get;
  const calls = [];
  t.after(() => { axios.get = originalGet; });

  axios.get = async (url) => {
    calls.push(url);
    if (url === 'https://streamimdb.ru/embed/movie?imdb=tt0076759') {
      return { data: '<iframe id="pf" src="https://cdn.example/player"></iframe>' };
    }
    if (url === 'https://cdn.example/player') {
      return { data: '<div class="cf-turnstile"></div><script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script>' };
    }
    if (url.startsWith('https://multiembed.mov/')) return { data: '' };
    throw new Error(`unexpected URL: ${url}`);
  };

  assert.equal(await fetchFromAltSources('tt0076759', 'movie'), null);
  assert.deepEqual(calls, [
    'https://streamimdb.ru/embed/movie?imdb=tt0076759',
    'https://cdn.example/player',
    'https://multiembed.mov/directstream.php?video_id=tt0076759',
  ]);
});
