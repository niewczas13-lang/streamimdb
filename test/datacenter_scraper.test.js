'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const { fetchFromDatacenterSources } = require('../datacenter_scraper');

function stubSources(t, stream, type = 'movie') {
  const originalGet = axios.get;
  const originalFetch = global.fetch;
  const originalKey = process.env.TMDB_API_KEY;
  process.env.TMDB_API_KEY = 'test-key';
  const calls = [];
  global.fetch = async () => ({
    json: async () => ({
      movie_results: type === 'movie' ? [{ id: 11, title: 'Star Wars', release_date: '1977-05-25' }] : [],
      tv_results: type === 'series' ? [{ id: 1396, name: 'Breaking Bad', first_air_date: '2008-01-20' }] : [],
    }),
  });
  axios.get = async (url) => {
    calls.push(url);
    if (url.startsWith('https://vixsrc.to/api/')) return { status: 403, data: '' };
    if (url.startsWith('https://enc-dec.app/api/enc-vidlink?text=')) {
      return { status: 200, data: { result: 'encoded-id' } };
    }
    const expectedUrl = type === 'series'
      ? 'https://vidlink.pro/api/b/tv/encoded-id/1/2?multiLang=0'
      : 'https://vidlink.pro/api/b/movie/encoded-id?multiLang=0';
    if (url === expectedUrl) return { status: 200, data: { sourceId: 'mwVault', stream } };
    throw new Error(`unexpected URL: ${url}`);
  };
  t.after(() => {
    axios.get = originalGet;
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.TMDB_API_KEY;
    else process.env.TMDB_API_KEY = originalKey;
  });
  return calls;
}

test('Vidlink file responses return the highest available MP4 directly with captions and headers', async (t) => {
  stubSources(t, {
    id: 'primary', type: 'file', flags: ['cors-allowed'],
    qualities: {
      360: { type: 'mp4', url: 'https://cdn.example/360.mp4' },
      1080: { type: 'mp4', url: '' },
      720: { type: 'mp4', url: 'https://cdn.example/720.mp4', headers: { 'X-Video': 'quality-token' }, requiresProxy: true },
    },
    headers: {}, preferredHeaders: { 'X-Provider': 'source-token' },
    captions: [{ id: 'pol', url: 'https://subs.example/pol.srt', language: 'Polish', type: 'srt' }],
  });

  const result = await fetchFromDatacenterSources('tt0076759', 'movie');
  assert.equal(result?.length, 1);
  assert.equal(result[0].url, 'https://cdn.example/720.mp4');
  assert.equal(result[0].quality, '720');
  assert.equal(result[0].proxyable, false);
  assert.equal(result[0].referer, undefined);
  assert.deepEqual(result[0].headers, { 'X-Provider': 'source-token', 'X-Video': 'quality-token' });
  assert.equal(result[0].captions[0].url, 'https://subs.example/pol.srt');
});

test('Vidlink episode responses retain HLS support and use the requested episode', async (t) => {
  stubSources(t, {
    id: 'primary', type: 'hls', flags: [], playlist: 'https://cdn.example/episode.m3u8',
    headers: { 'X-Video': 'hls-token' }, captions: [],
  }, 'series');

  const result = await fetchFromDatacenterSources('tt0903747', 'series', '1', '2');
  assert.equal(result?.length, 1);
  assert.equal(result[0].url, 'https://cdn.example/episode.m3u8');
  assert.equal(result[0].quality, 'Auto');
  assert.equal(result[0].proxyable, false);
  assert.deepEqual(result[0].headers, { 'X-Video': 'hls-token' });
});

test('Vidlink file responses without a usable URL fall through instead of offering a broken stream', async (t) => {
  stubSources(t, { id: 'primary', type: 'file', qualities: { 1080: { type: 'mp4' } } });
  assert.equal(await fetchFromDatacenterSources('tt0076759', 'movie'), null);
});
