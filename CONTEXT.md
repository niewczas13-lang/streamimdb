# Projecto: StreamIMDb Connector — Contexto Técnico

## Estado Actual (v1.1.1)

Add-on público para Stremio que extrai streams de vídeo (`.m3u8`) e os serve nativamente no player do Stremio sem abrir o browser. Stack actual: `axios` puro + `stremio-addon-sdk` + `express`.

## Fluxo Técnico

1. Stremio fornece IMDb ID (ex: `tt0076759`). Séries: `tt1234567:1:2` → split por `:`.
2. `scraper.js` chama `streamdata.vaplayer.ru/api.php?imdb={id}&type=movie|tv` com headers obrigatórios (`Referer`, `Origin`, `X-Requested-With`) a imitar o player `brightpathsignals.com`.
3. API devolve JSON com `data.stream_urls[]` — lista de master `.m3u8` de CDNs variados.
4. Todos os URLs são testados em paralelo; o primeiro verificado (200) é usado.
5. `parseMasterPlaylist()` lê a master `.m3u8` e extrai todas as variantes por BANDWIDTH/RESOLUTION → devolvidas como streams separados (4K/2K/1080p/720p/480p).
6. Se CDN bloquear pré-fetch (403), o URL master é passado directamente ao Stremio (HLS nativo).

## Problema das Legendas

OpenSubtitles usa Cloudflare para proteger o endpoint `/download`. IPs de datacenter (Render e Cloudflare Workers) são bloqueados com erro 503 HTML. O endpoint de pesquisa (`/subtitles`) funciona; só o download é bloqueado.

**Solução planeada:** proxy doméstico — servidor Node.js em casa com IP residencial que recebe pedidos do Render, faz o `/download` ao OpenSubtitles e devolve o link. Env vars: `SUBS_PROXY_URL`, `SUBS_PROXY_SECRET`.

## Problema do Auto-play

`bingeGroup` activo no addon. O Stremio mostra ecrã de "próximo episódio" no fim de cada episódio, mas não avança automaticamente porque não re-consulta addons externos de legendas (OpenSubtitles) ao fazer auto-play — ficam as legendas do episódio anterior.

Quando o proxy doméstico estiver operacional e as legendas forem servidas pelo nosso addon, o auto-play completo ficará disponível com `subtitles: []` no stream response.

## Evolução do Projecto

| Versão | Mudança principal |
|---|---|
| v1.0 | Puppeteer headless Chrome — 25s/pedido, 150MB RAM |
| v1.1 | Substituído por axios puro — <5s, ~5MB RAM |
| v1.1.1 | CDN fallback automático, `/health` endpoint, qualidade selecionável, health checks com alertas |
