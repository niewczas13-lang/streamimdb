'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

test('HEALTH_CHECK_INTERVAL_MS=0 disables scheduled health checks', () => {
  const script = `
    process.env.HEALTH_CHECK_INTERVAL_MS = '0';
    const { startHealthChecks } = require('./health');
    const intervalId = startHealthChecks();
    console.log(intervalId === null ? 'disabled' : 'enabled');
    if (intervalId) clearInterval(intervalId);
  `;

  const result = spawnSync(process.execPath, ['-e', script], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /disabled/);
});
