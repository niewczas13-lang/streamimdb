'use strict';
const axios = require('axios');

const configuredInterval = Number.parseInt(process.env.HEALTH_CHECK_INTERVAL_MS ?? '', 10);
const CHECK_INTERVAL = Number.isNaN(configuredInterval) ? 5 * 60 * 1000 : configuredInterval; // 5min
const ALERT_EMAIL = process.env.ALERT_EMAIL;
const ALERT_WEBHOOK = process.env.ALERT_WEBHOOK;

let lastStatus = 'ok';
let downSince = null;
let alertSent = false;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';

// Testa a fonte primária (VixSrc). TMDB id 11 = Star Wars (1977).
async function testAPI() {
  try {
    const res = await axios.get('https://vixsrc.to/api/movie/11', {
      headers: {
        'User-Agent': UA,
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Referer': 'https://vixsrc.to',
        'Origin': 'https://vixsrc.to',
      },
      timeout: 8000,
      validateStatus: s => s < 500,
    });

    if (res.status === 200 && res.data && res.data.src) {
      return { ok: true, message: 'VixSrc respondeu com src' };
    }
    return { ok: false, message: `VixSrc status ${res.status}, sem src` };
  } catch (e) {
    return { ok: false, message: `Erro: ${e.message}` };
  }
}

async function sendAlert(subject, body) {
  console.log(`[health] ALERTA: ${subject}`);

  if (ALERT_WEBHOOK) {
    try {
      await axios.post(ALERT_WEBHOOK, {
        text: `🚨 StreamIMDb Alert\n${subject}\n${body}`,
      }, { timeout: 5000 });
    } catch (e) {
      console.log(`[health] Erro ao enviar webhook: ${e.message}`);
    }
  }

  if (ALERT_EMAIL) {
    console.log(`[health] Email alertaria para: ${ALERT_EMAIL}`);
    // Implementação real requer nodemailer ou serviço externo
  }
}

async function healthCheck() {
  const result = await testAPI();

  if (result.ok) {
    // API está ok
    if (lastStatus === 'down') {
      console.log('[health] ✓ API RECUPERADA');
      await sendAlert('✓ StreamIMDb API Recuperada', `A API voltou a estar operacional após ${downSince ? Math.floor((Date.now() - downSince) / 1000) : '?'}s de downtime.`);
      downSince = null;
      alertSent = false;
    }
    lastStatus = 'ok';
  } else {
    // API está down
    if (lastStatus === 'ok') {
      console.log(`[health] ✗ API DOWN: ${result.message}`);
      downSince = Date.now();
      alertSent = false;
      lastStatus = 'down';
    }

    // Enviar alerta após 5 min de downtime se ainda não foi enviado
    const downtimeMs = Date.now() - downSince;
    if (!alertSent && downtimeMs > 5 * 60 * 1000) {
      await sendAlert('✗ StreamIMDb API Down', `API indisponível há ${Math.floor(downtimeMs / 1000)}s. Última mensagem: ${result.message}`);
      alertSent = true;
    }
  }
}

function getHealthStatus() {
  return {
    status: lastStatus,
    downSince,
    lastCheck: new Date().toISOString(),
    checkInterval: Math.floor(CHECK_INTERVAL / 1000),
  };
}

function startHealthChecks() {
  if (CHECK_INTERVAL === 0) {
    console.log('[health] Health checks desactivados (HEALTH_CHECK_INTERVAL_MS=0)');
    return null;
  }
  healthCheck(); // Primeira check imediatamente
  const intervalId = setInterval(healthCheck, CHECK_INTERVAL);
  console.log(`[health] Health checks iniciados a cada ${Math.floor(CHECK_INTERVAL / 1000)}s`);
  return intervalId;
}

module.exports = { startHealthChecks, getHealthStatus, healthCheck };
