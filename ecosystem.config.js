module.exports = {
  apps: [{
    name: 'nexo-wiki',
    cwd: './wiki',
    script: 'server/index.js',
    watch: false,
    autorestart: true,
    max_restarts: 5,
    restart_delay: 5000
  }]
}
