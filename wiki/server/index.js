// ===========================================
// Wiki.js
// Licensed under AGPLv3
// ===========================================

// Load .env from project root (parent of wiki/)
const fs = require('fs')
const envPath = require('path').resolve(__dirname, '../../.env')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    const val = trimmed.slice(idx + 1).trim()
    if (!process.env[key]) process.env[key] = val
  }
}

const path = require('path')
const { nanoid } = require('nanoid')
const { DateTime } = require('luxon')
const { gte } = require('semver')

// ----------------------------------------
// Init WIKI instance
// ----------------------------------------

let WIKI = {
  IS_DEBUG: process.env.NODE_ENV === 'development',
  IS_MASTER: true,
  ROOTPATH: process.cwd(),
  INSTANCE_ID: nanoid(10),
  SERVERPATH: path.join(process.cwd(), 'server'),
  Error: require('./helpers/error'),
  configSvc: require('./core/config'),
  kernel: require('./core/kernel'),
  startedAt: DateTime.utc()
}
global.WIKI = WIKI

WIKI.configSvc.init()

// ----------------------------------------
// Init Logger
// ----------------------------------------

WIKI.logger = require('./core/logger').init('MASTER')

// ----------------------------------------
// Start Kernel
// ----------------------------------------

WIKI.kernel.init()

// ----------------------------------------
// Register exit handler
// ----------------------------------------

process.on('SIGTERM', () => {
  WIKI.kernel.shutdown()
})
process.on('SIGINT', () => {
  WIKI.kernel.shutdown()
})
process.on('message', (msg) => {
  if (msg === 'shutdown') {
    WIKI.kernel.shutdown()
  }
})
