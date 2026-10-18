'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

test('Vercel serves add-on metadata and rejects all media proxy routes without fetching media', async (t) => {
  const keys = ['VERCEL', 'SERVER_URL', 'PROXY_SECRET', 'HEALTH_CHECK_INTERVAL_MS'];
  const originalEnv = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  Object.assign(process.env, { VERCEL: '1', SERVER_URL: 'https://example.vercel.app', PROXY_SECRET: 'test-secret', HEALTH_CHECK_INTERVAL_MS: '0' });
  const axios = require('axios');
  const originalGet = axios.get;
  let upstreamRequests = 0;
  axios.get = async () => { upstreamRequests++; throw new Error('media must not be fetched'); };
  t.after(() => {
    axios.get = originalGet;
    for (const key of keys) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  });

  const app = require('../server');
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const manifest = await fetch(`${base}/manifest.json`).then(response => response.json());
  assert.equal(manifest.id, 'org.local.streamimdb');

  for (const path of ['/hls/invalid.m3u8', '/seg/invalid.ts', '/subs/invalid.m3u8', '/sub/invalid.vtt']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 404, path);
  }
  assert.equal(upstreamRequests, 0);
});
