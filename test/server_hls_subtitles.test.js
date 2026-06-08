'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

test('HLS proxy injects subtitle tracks into master playlists', async (t) => {
  process.env.VERCEL = '1';
  process.env.SERVER_URL = 'https://example.vercel.app';
  process.env.PROXY_SECRET = 'test-secret';
  process.env.HEALTH_CHECK_INTERVAL_MS = '0';

  const axios = require('axios');
  const originalGet = axios.get;
  axios.get = async (url) => {
    if (url === 'https://cdn.example/master.m3u8') {
      return {
        status: 200,
        data: '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=1280x720\nvariant.m3u8\n',
      };
    }

    throw new Error(`unexpected URL: ${url}`);
  };

  t.after(() => {
    axios.get = originalGet;
    delete process.env.VERCEL;
    delete process.env.SERVER_URL;
    delete process.env.PROXY_SECRET;
    delete process.env.HEALTH_CHECK_INTERVAL_MS;
  });

  const { sign } = require('../proxy_token');
  const app = require('../server');
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  t.after(() => server.close());

  const token = sign({
    u: 'https://cdn.example/master.m3u8',
    r: 'https://referer.example/',
    m: { imdbId: 'tt10986410', type: 'series', season: '1', episode: '1' },
    s: [{
      id: 'caption-pol',
      url: 'https://subs.example/pol-29.vtt',
      lang: 'pol',
    }],
  });

  const port = server.address().port;
  const response = await fetch(`http://127.0.0.1:${port}/hls/${token}.m3u8`);
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(body, /#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="pol",LANGUAGE="pol",AUTOSELECT=YES,DEFAULT=YES,URI="https:\/\/subs\.example\/pol-29\.vtt"/);
  assert.match(body, /#EXT-X-STREAM-INF:[^\n]*SUBTITLES="subs"/);
});
