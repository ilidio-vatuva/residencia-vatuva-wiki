module.exports = {
  apps: [{
    name: 'wiki',
    cwd: './wiki',
    script: 'server/index.js',
    env_file: '.env',
    watch: false,
    autorestart: true,
    max_restarts: 5,
    restart_delay: 5000
  }]
}
