const jwt = require('jsonwebtoken')

/* global WIKI */

/**
 * Custom auth middleware for the REST API.
 *
 * Supports two authentication methods:
 *   1. User JWT (HS256) – same token issued by the backend service.
 *      Header: Authorization: Bearer <token>
 *   2. Service secret – shared secret for service-to-service calls (AI).
 *      Header: X-Service-Secret: <secret>
 */
module.exports = (req, res, next) => {
  const serviceSecret = process.env.SERVICE_SECRET
  const jwtSecret = process.env.JWT_SECRET

  // --- Service-to-service authentication ---
  const incomingSecret = req.headers['x-service-secret']
  if (incomingSecret) {
    if (!serviceSecret) {
      return res.status(500).json({ error: 'SERVICE_SECRET not configured' })
    }
    if (incomingSecret !== serviceSecret) {
      return res.status(401).json({ error: 'Invalid service secret' })
    }
    req.apiUser = { type: 'service' }
    return next()
  }

  // --- User JWT authentication ---
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' })
  }

  const token = authHeader.slice(7)
  if (!jwtSecret) {
    return res.status(500).json({ error: 'JWT_SECRET not configured' })
  }

  try {
    const payload = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] })
    req.apiUser = { type: 'user', userId: payload.userId }
    next()
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}
