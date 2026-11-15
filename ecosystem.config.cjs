// pm2: backend (cwd ./backend para o dotenv achar o .env) + painel buildado servido como SPA.
module.exports = {
  apps: [
    {
      name: 'qtv-backend',
      script: 'src/server.js',
      cwd: './backend',
      autorestart: true,
      max_restarts: 20,
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'qtv-frontend',
      script: 'serve',
      env: {
        PM2_SERVE_PATH: './frontend/dist',
        PM2_SERVE_PORT: 5173,
        PM2_SERVE_SPA: 'true',
        PM2_SERVE_HOMEPAGE: '/index.html',
      },
    },
  ],
};
