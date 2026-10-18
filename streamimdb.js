'use strict';

const STREAMIMDB_BASE = 'https://streamimdb.ru';

function streamImdbEmbedUrl(imdbId, type, season, episode) {
  const url = new URL(type === 'series' ? '/embed/tv' : '/embed/movie', STREAMIMDB_BASE);
  url.searchParams.set('imdb', imdbId);
  if (type === 'series') {
    url.searchParams.set('season', season);
    url.searchParams.set('episode', episode);
  }
  return url.href;
}

module.exports = { STREAMIMDB_BASE, streamImdbEmbedUrl };
