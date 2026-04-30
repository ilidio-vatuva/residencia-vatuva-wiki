module.exports = {
  apps: [{
    name: 'wiki',
    cwd: './wiki',
    script: 'server/index.js',
    watch: false,
    autorestart: true,
    max_restarts: 5,
    restart_delay: 5000,

    // ----------------------------------------------------------------
    // Logging
    // ----------------------------------------------------------------
    // Explicit log paths — the centralised log viewer (`/blimunda/logs`,
    // see documentation/operations-bugs-logs-epic.md) reads from
    // `~/.pm2/logs/wiki-out.log` and `~/.pm2/logs/wiki-error.log`.
    // Keeping the defaults explicit documents the contract.
    out_file: `${process.env.HOME}/.pm2/logs/wiki-out.log`,
    error_file: `${process.env.HOME}/.pm2/logs/wiki-error.log`,
    merge_logs: true,
    // The Wiki.js logger already emits an ISO timestamp wrapped in `[...]`
    // at the start of each line, so disable PM2's own timestamp prefix to
    // avoid double timestamps and keep the `^\[(.*?)\]` regex working.
    time: false
  }]
}
