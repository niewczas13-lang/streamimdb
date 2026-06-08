module.exports = {
  apps: [{
    name: 'stremio-addon',
    script: 'server.js',
    env: {
      PORT: 7000,
      TMDB_API_KEY: process.env.TMDB_API_KEY || ''
    }
  }]
};
