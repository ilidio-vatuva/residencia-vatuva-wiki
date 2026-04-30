const winston = require('winston')

/* global WIKI */

// Detect whether stdout is being captured by a process manager (e.g. PM2,
// systemd, Docker). When not attached to a TTY we MUST NOT emit ANSI colour
// escape sequences — they pollute the log files that the centralised log
// viewer (`/blimunda/logs`) reads from `~/.pm2/logs/wiki-*.log` and break
// the parser regexes (`^\[(.*?)\]` for timestamp, `\b(ERROR|WARN|INFO|DEBUG)\b`
// for level).
const isTTY = Boolean(process.stdout && process.stdout.isTTY)

module.exports = {
  loggers: {},
  init(uid) {
    const useJson = WIKI.config.logFormat === 'json'
    // Force-disable colour output when stdout is not a TTY so PM2 log files
    // remain machine-parseable. Override via `logColorize: true|false` in config.yml.
    const useColors = typeof WIKI.config.logColorize === 'boolean'
      ? WIKI.config.logColorize
      : isTTY && !useJson

    const loggerFormats = [
      winston.format.label({ label: uid }),
      // Capture stack traces from Error instances passed to logger.error(err)
      winston.format.errors({ stack: true }),
      // ISO 8601 timestamp — wrapped in brackets at the start of each line
      // so the log aggregator's `^\[(.*?)\]` regex can extract it.
      winston.format.timestamp()
    ]

    if (useJson) {
      loggerFormats.push(winston.format.json())
    } else {
      if (useColors) {
        loggerFormats.push(winston.format.colorize())
      }
      loggerFormats.push(winston.format.printf(info => {
        // Output: `[2026-04-30T10:15:00.000Z] INFO [LABEL]: message\nstack...`
        // - Timestamp first, in brackets, parseable as ISO 8601.
        // - Level uppercased so the aggregator's case-insensitive regex
        //   matches reliably.
        const rawLevel = String(info.level).replace(/\u001b\[[0-9;]*m/g, '')
        const upper = rawLevel.toUpperCase()
        const levelOut = useColors ? info.level.replace(rawLevel, upper) : upper
        const stack = info.stack ? `\n${info.stack}` : ''
        return `[${info.timestamp}] ${levelOut} [${info.label}]: ${info.message}${stack}`
      }))
    }

    const logger = winston.createLogger({
      level: WIKI.config.logLevel,
      format: winston.format.combine(...loggerFormats)
    })

    // ----------------------------------------------------------------
    // Console transport
    // ----------------------------------------------------------------
    // Route warn/error to stderr and info/debug/* to stdout so PM2
    // (and other process managers) split them correctly into
    // `wiki-error.log` and `wiki-out.log`.
    logger.add(new winston.transports.Console({
      level: WIKI.config.logLevel,
      stderrLevels: ['error', 'warn'],
      handleExceptions: true,
      handleRejections: true,
      silent: false
    }))

    return logger
  }
}
