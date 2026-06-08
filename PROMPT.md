# StreamIMDb Connector — Estado (v1.1.1)

## Deploy
Render (`stremio-addon-streamimdb.onrender.com`) · branch `main`
Landing page em `/` — donativo paypal.me/F100Pilot · reporte pflm.bet@gmail.com

## Stack
`axios` + `stremio-addon-sdk` + `express` · sem browser/Puppeteer

## Fluxo actual
1. Stremio envia IMDb ID → `defineStreamHandler` em `addon.js`
2. `scraper.js` chama `streamdata.vaplayer.ru/api.php?imdb={id}&type=movie|tv` com headers `Referer/Origin` de `brightpathsignals.com`
3. JSON devolve `data.stream_urls[]` — testados em paralelo; primeiro verificado (200) ou acessível (4xx) é usado
4. `parseMasterPlaylist()` extrai todas as variantes de qualidade da master `.m3u8`
5. Se CDN bloquear pré-fetch (403), retorna URL directo com qualidade `Auto`
6. Cache 15min + deduplicação de pedidos + rejeição por sobrecarga (`MAX_QUEUE=3`)

## Implementado
- Fallback automático entre todos os `stream_urls[]` ✓
- Qualidade selecionável — todas as variantes (4K/2K/1080p/720p/480p) ✓
- `/health` endpoint (uptime, cache, memória, estado da API) ✓
- Health checks periódicos com alertas (webhook/email) ✓
- bingeGroup — ecrã de próximo episódio no fim de cada episódio ✓
- Puppeteer eliminado → axios puro (<5s, ~5MB RAM) ✓

## Em aberto

| Prioridade | Feature | Notas |
|---|---|---|
| Alta | **Legendas + auto-play completo** | OpenSubtitles `/download` bloqueado por Cloudflare em IPs de datacenter. Solução: proxy doméstico (servidor em casa com IP residencial) que faz o pedido e devolve o link ao Render. Quando implementado, auto-play pleno também fica disponível. |
| Média | **Catalog básico** | Conteúdos populares/recentes para o add-on ser descobrível dentro do Stremio. Requer fonte externa (ex: TMDB API). |
