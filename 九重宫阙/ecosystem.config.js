/**
 * PM2 部署配置（裁决 R10：SQLite 全量镜像写 → 必须 fork + instances=1 单写者）
 * 起用：JWT_SECRET=xxx pm2 start ecosystem.config.js --env production
 */
module.exports = {
  apps: [
    {
      name: 'jiuchong-gongque',
      script: 'server.js',
      cwd: __dirname,
      exec_mode: 'fork',
      instances: 1,
      max_memory_restart: '512M',
      autorestart: true,
      restart_delay: 2000,
      exp_backoff_restart_delay: 200,
      kill_timeout: 8000,
      wait_ready: false,
      time: true,
      merge_logs: true,
      out_file: './logs/out.log',
      error_file: './logs/err.log',
      env_development: { NODE_ENV: 'development', PORT: 3000 },
      env_production: { NODE_ENV: 'production', PORT: 3000 }
      // JWT_SECRET 由宿主环境注入，绝不写入本文件（本文件会入库）
    }
  ]
};
