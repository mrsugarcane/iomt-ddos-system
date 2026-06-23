/**
 * Non-Docker production alternative: run the backend under PM2 for
 * auto-restart on crash, log rotation, and zero-downtime reloads.
 *
 * Install:  npm install -g pm2
 * Start:    pm2 start ecosystem.config.js --env production
 * Logs:     pm2 logs sentinel-backend
 * Status:   pm2 status
 * Reload:   pm2 reload sentinel-backend   (zero-downtime)
 * Persist across reboots: pm2 startup && pm2 save
 */
module.exports = {
  apps: [
    {
      name: "sentinel-backend",
      script: "server.js",
      cwd: __dirname,
      instances: 1,              // SQLite + in-memory SSE state — keep at 1
                                  // unless you move sessions/alerts to a
                                  // shared store before scaling out
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "development",
        PORT: 4000,
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 4000,
      },
      error_file: "./logs/pm2-error.log",
      out_file: "./logs/pm2-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
    },
  ],
};
