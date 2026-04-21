module.exports = {
  apps: [{
    name: 'allusion-booking',
    script: 'backend/src/index.js',
    cwd: '/home/trader/projects/allusion-booking',
    env_file: 'backend/.env',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '200M',
    error_file: 'logs/error.log',
    out_file: 'logs/out.log',
    log_file: 'logs/combined.log',
    time: true,
  }],
};
