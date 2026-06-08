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

    if (url === 'https://subs.example/pol-29.vtt') {
      return {
        status: 200,
        data: 'WEBVTT\n\n00:00.000 --> 00:02.000\nCzesc\n',
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
  const subtitlePlaylistUrl = body.match(/URI="([^"]+\/subs\/[^"]+\.m3u8)"/)?.[1];
  assert.ok(subtitlePlaylistUrl);
  assert.match(body, /#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="pol",LANGUAGE="pol",AUTOSELECT=YES,DEFAULT=YES,URI="https:\/\/example\.vercel\.app\/subs\/[^"]+\.m3u8"/);
  assert.match(body, /#EXT-X-STREAM-INF:[^\n]*SUBTITLES="subs"/);

  const localSubtitlePlaylistUrl = subtitlePlaylistUrl.replace('https://example.vercel.app', `http://127.0.0.1:${port}`);
  const subtitlePlaylistResponse = await fetch(localSubtitlePlaylistUrl);
  const subtitlePlaylistBody = await subtitlePlaylistResponse.text();
  assert.equal(subtitlePlaylistResponse.status, 200);
  assert.match(subtitlePlaylistBody, /#EXTINF:14400\.000,/);

  const subtitleSegmentUrl = subtitlePlaylistBody.match(/(https:\/\/example\.vercel\.app\/sub\/[^\s]+\.vtt)/)?.[1];
  assert.ok(subtitleSegmentUrl);
  const localSubtitleSegmentUrl = subtitleSegmentUrl.replace('https://example.vercel.app', `http://127.0.0.1:${port}`);
  const subtitleSegmentResponse = await fetch(localSubtitleSegmentUrl);
  const subtitleSegmentBody = await subtitleSegmentResponse.text();
  assert.equal(subtitleSegmentResponse.status, 200);
  assert.equal(subtitleSegmentResponse.headers.get('content-type'), 'text/vtt; charset=utf-8');
  assert.match(subtitleSegmentBody, /WEBVTT/);
});
