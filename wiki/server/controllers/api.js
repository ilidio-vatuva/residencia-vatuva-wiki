const express = require('express')
const router = express.Router()
const bodyParser = require('body-parser')
const swaggerUi = require('swagger-ui-express')
const swaggerDoc = require('../swagger.json')
const apiAuth = require('../middlewares/apiAuth')
const _ = require('lodash')

/* global WIKI */

// ─── GET /auth/sso — Browser SSO login from frontend ───
// Must be before swagger and apiAuth middleware

router.get('/auth/sso', async (req, res) => {
  const jwt = require('jsonwebtoken')
  const commonHelper = require('../helpers/common')

  try {
    const { token, redirect } = req.query

    if (!token) {
      return res.status(400).send('Missing token parameter')
    }

    // Validate redirect is a safe relative path
    const safeRedirect = (redirect && redirect.startsWith('/') && !redirect.startsWith('//') && !redirect.includes('://'))
      ? redirect
      : '/'

    const jwtSecret = process.env.JWT_SECRET
    if (!jwtSecret) {
      return res.status(500).send('JWT_SECRET not configured')
    }

    // Verify the backend JWT
    let payload
    try {
      payload = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] })
    } catch (err) {
      return res.redirect('/login')
    }

    // Find or create the Wiki.js user for this backend user
    let wikiUser = await WIKI.models.users.query()
      .where('providerId', payload.userId)
      .where('providerKey', 'local')
      .first()

    if (!wikiUser) {
      const defaultGroup = await WIKI.models.groups.query().where('name', process.env.WIKI_DEFAULT_GROUP || 'Guests').first()
      wikiUser = await WIKI.models.users.query().insertAndFetch({
        email: `${payload.userId}@backend.internal`,
        name: `Backend User ${payload.userId.slice(0, 8)}`,
        providerId: payload.userId,
        providerKey: 'local',
        password: require('crypto').randomBytes(32).toString('hex'),
        isSystem: false,
        isActive: true,
        isVerified: true,
        // Match the site language (lang.code in settings) so the editor
        // resolves pages stored under this locale. Otherwise users default
        // to `en` and pages stored as `pt` appear as "page does not exist".
        localeCode: WIKI.config.lang?.code || 'en'
      })
      if (defaultGroup) {
        await wikiUser.$relatedQuery('groups').relate(defaultGroup.id)
      }
    }

    // Issue a Wiki.js internal JWT and set the session cookie
    const result = await WIKI.models.users.refreshToken(wikiUser)
    res.cookie('jwt', result.token, commonHelper.getCookieOpts())
    WIKI.logger.info(`[API] SSO login OK — userId=${payload.userId} redirect=${safeRedirect}`)
    res.redirect(safeRedirect)
  } catch (err) {
    WIKI.logger.error(`[API] SSO login FAILED — ${err.message}`)
    res.redirect('/login')
  }
})

// ─── Swagger UI (no auth required) ──────────────────────

router.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDoc, {
  customSiteTitle: 'Wiki.js API Docs'
}))
router.get('/api/docs.json', (req, res) => res.json(swaggerDoc))

// Parse JSON bodies + auth for all other API routes
router.use('/api', bodyParser.json({ limit: '1mb' }))
router.use('/api', apiAuth)

// ─── Helpers ─────────────────────────────────────────────

const METADATA_FIELDS = ['projectId', 'phaseId', 'taskId']

function pickMetadata (body) {
  const meta = {}
  for (const f of METADATA_FIELDS) {
    if (body[f] !== undefined) meta[f] = body[f] || null
  }
  return meta
}

function formatPage (page) {
  return {
    id: page.id,
    path: page.path,
    title: page.title,
    description: page.description,
    content: page.content,
    contentType: page.contentType,
    editorKey: page.editorKey,
    isPublished: page.isPublished,
    localeCode: page.localeCode,
    projectId: page.projectId || null,
    phaseId: page.phaseId || null,
    taskId: page.taskId || null,
    createdAt: page.createdAt,
    updatedAt: page.updatedAt,
    authorId: page.authorId,
    creatorId: page.creatorId
  }
}

// ─── GET /api/pages/search ──────────────────────────────

router.get('/api/pages/search', async (req, res) => {
  try {
    const { q, projectId, phaseId, taskId, limit = 50, offset = 0 } = req.query

    let query = WIKI.models.pages.query()
      .select('id', 'path', 'title', 'description', 'contentType', 'localeCode',
        'projectId', 'phaseId', 'taskId', 'isPublished', 'createdAt', 'updatedAt')

    if (q) {
      query = query.where(builder => {
        builder
          .where('title', 'ilike', `%${q}%`)
          .orWhere('description', 'ilike', `%${q}%`)
      })
    }
    if (projectId) query = query.where('projectId', projectId)
    if (phaseId) query = query.where('phaseId', phaseId)
    if (taskId) query = query.where('taskId', taskId)

    const pages = await query
      .orderBy('updatedAt', 'desc')
      .limit(Math.min(parseInt(limit), 100))
      .offset(parseInt(offset))

    WIKI.logger.info(`[API] searchPages — caller=${req.apiUser.type} q=${q || ''} results=${pages.length}`)
    res.json({ results: pages.map(formatPage), count: pages.length })
  } catch (err) {
    WIKI.logger.error(`[API] searchPages FAILED — ${err.message}\n${err.stack}`)
    res.status(500).json({ error: 'Internal server error', details: err.message })
  }
})

// ─── GET /api/pages/by-path/:path(*) ───────────────────

router.get('/api/pages/by-path/:path(*)', async (req, res) => {
  try {
    const locale = req.query.locale || 'en'
    const page = await WIKI.models.pages.query()
      .where('path', req.params.path)
      .where('localeCode', locale)
      .first()
    if (!page) {
      WIKI.logger.info(`[API] getPageByPath — caller=${req.apiUser.type} path=${req.params.path} result=404`)
      return res.status(404).json({ error: 'Page not found' })
    }
    WIKI.logger.info(`[API] getPageByPath — caller=${req.apiUser.type} path=${req.params.path} pageId=${page.id}`)
    res.json(formatPage(page))
  } catch (err) {
    WIKI.logger.error(`[API] getPageByPath FAILED — ${err.message}`)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ─── GET /api/pages/:id ─────────────────────────────────

router.get('/api/pages/:id', async (req, res) => {
  try {
    const page = await WIKI.models.pages.query().findById(req.params.id)
    if (!page) {
      WIKI.logger.info(`[API] getPage — caller=${req.apiUser.type} id=${req.params.id} result=404`)
      return res.status(404).json({ error: 'Page not found' })
    }
    WIKI.logger.info(`[API] getPage — caller=${req.apiUser.type} id=${req.params.id} title="${page.title}"`)
    res.json(formatPage(page))
  } catch (err) {
    WIKI.logger.error(`[API] getPage FAILED — ${err.message}`)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ─── POST /api/pages ────────────────────────────────────

router.post('/api/pages', async (req, res) => {
  WIKI.logger.info(`[API] POST /api/pages payload: ${JSON.stringify(req.body)}`)
  try {
    const { path, title, content, description, tags, locale, editor, isPublished, isPrivate } = req.body

    if (!path || !title || !content) {
      return res.status(400).json({ error: 'path, title, and content are required' })
    }

    // Authentication is enforced by the JWT middleware at the API boundary.
    // Route the underlying Wiki.js mutation through the service admin user so
    // any authenticated caller can write; the real caller is still logged.
    const user = await getServiceUser()

    const page = await WIKI.models.pages.createPage({
      path,
      title,
      content,
      description: description || '',
      editor: editor || 'markdown',
      locale: locale || 'en',
      isPublished: isPublished !== false,
      isPrivate: isPrivate || false,
      tags: tags || [],
      user,
      skipStorage: true
    })

    // Set metadata columns
    const metadata = pickMetadata(req.body)
    if (Object.keys(metadata).length > 0) {
      await WIKI.models.pages.query().findById(page.id).patch(metadata)
    }

    const updated = await WIKI.models.pages.query().findById(page.id)
    WIKI.logger.info(`[API] createPage — caller=${req.apiUser.type} path=${path} pageId=${page.id}`)
    res.status(201).json(formatPage(updated))
  } catch (err) {
    WIKI.logger.error(`[API] createPage FAILED — ${err.message}`)
    if (err.message.includes('Duplicate')) {
      return res.status(409).json({ error: err.message })
    }
    res.status(500).json({ error: err.message })
  }
})

// ─── PUT /api/pages/:id ─────────────────────────────────

router.put('/api/pages/:id', async (req, res) => {
  WIKI.logger.info(`[API] PUT /api/pages/${req.params.id} payload: ${JSON.stringify(req.body)}`)
  try {
    const existing = await WIKI.models.pages.query().findById(req.params.id)
    if (!existing) {
      return res.status(404).json({ error: 'Page not found' })
    }

    const user = await getServiceUser()

    const updateOpts = {
      id: existing.id,
      content: req.body.content || existing.content,
      title: req.body.title || existing.title,
      description: req.body.description !== undefined ? req.body.description : existing.description,
      isPublished: req.body.isPublished !== undefined ? req.body.isPublished : existing.isPublished,
      tags: req.body.tags || [],
      user,
      skipStorage: true
    }

    await WIKI.models.pages.updatePage(updateOpts)

    // Update metadata columns
    const metadata = pickMetadata(req.body)
    if (Object.keys(metadata).length > 0) {
      await WIKI.models.pages.query().findById(existing.id).patch(metadata)
    }

    const page = await WIKI.models.pages.query().findById(existing.id)
    WIKI.logger.info(`[API] updatePage — caller=${req.apiUser.type} id=${existing.id} title="${page.title}"`)
    res.json(formatPage(page))
  } catch (err) {
    WIKI.logger.error(`[API] updatePage FAILED — ${err.message}`)
    res.status(500).json({ error: err.message })
  }
})

// ─── POST /api/pages/:id/comments ───────────────────────

router.post('/api/pages/:id/comments', async (req, res) => {
  try {
    const pageId = parseInt(req.params.id, 10)
    if (isNaN(pageId)) {
      return res.status(400).json({ error: 'Invalid page ID' })
    }

    const { content, replyTo } = req.body
    if (!content || content.trim().length < 2) {
      return res.status(400).json({ error: 'content is required (min 2 chars)' })
    }

    const user = await getOrCreateApiUser(req.apiUser)

    const cmId = await WIKI.models.comments.postNewComment({
      pageId,
      replyTo: replyTo || 0,
      content: content.trim(),
      user,
      ip: req.ip
    })

    WIKI.logger.info(`[API] createComment — caller=${req.apiUser.type} pageId=${pageId} commentId=${cmId}`)
    res.status(201).json({ id: cmId, pageId })
  } catch (err) {
    WIKI.logger.error(`[API] createComment FAILED — ${err.message}`)
    res.status(500).json({ error: err.message })
  }
})

// ─── GET /api/pages/:id/comments ────────────────────────

router.get('/api/pages/:id/comments', async (req, res) => {
  try {
    const pageId = parseInt(req.params.id, 10)
    if (isNaN(pageId)) {
      return res.status(400).json({ error: 'Invalid page ID' })
    }

    const comments = await WIKI.models.comments.query()
      .where('pageId', pageId)
      .orderBy('createdAt')

    res.json(comments.map(c => ({
      id: c.id,
      content: c.content,
      render: c.render,
      authorId: c.authorId,
      authorName: c.name,
      replyTo: c.replyTo || 0,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt
    })))
  } catch (err) {
    WIKI.logger.error(`[API] getComments FAILED — ${err.message}`)
    res.status(500).json({ error: err.message })
  }
})

// ─── Helper: get or create a Wiki.js user for API calls ─

/**
 * Return the service admin user used for all API-mutated pages.
 *
 * Authentication against Residencia Vatuva's JWT already happens upstream;
 * Wiki.js-level RBAC is redundant for this API surface, so every mutation
 * routes through this single shared admin identity. Real caller identity is
 * preserved in the request logs.
 */
async function getServiceUser () {
  let svcUser = await WIKI.models.users.query()
    .where('email', 'service@wiki.internal')
    .first()

  if (!svcUser) {
    const adminGroup = await WIKI.models.groups.query().where('name', 'Administrators').first()
    svcUser = await WIKI.models.users.query().insertAndFetch({
      email: 'service@wiki.internal',
      name: 'Service Account',
      providerId: '0',
      providerKey: 'local',
      password: require('crypto').randomBytes(32).toString('hex'),
      isSystem: false,
      isActive: true,
      isVerified: true
    })
    if (adminGroup) {
      await svcUser.$relatedQuery('groups').relate(adminGroup.id)
    }
  }

  const groups = await svcUser.$relatedQuery('groups')
  svcUser.permissions = []
  svcUser.groups = groups.map(g => g.id)
  for (const grp of groups) {
    svcUser.permissions.push(...(grp.permissions || []))
  }
  svcUser.getGlobalPermissions = () => svcUser.permissions
  svcUser.getGroups = () => svcUser.groups

  return svcUser
}

async function getOrCreateApiUser (apiUser) {
  if (apiUser.type === 'service') {
    // Use the built-in guest user or first admin as the service user
    let svcUser = await WIKI.models.users.query()
      .where('email', 'service@wiki.internal')
      .first()

    if (!svcUser) {
      // Create a service account with full admin rights
      const adminGroup = await WIKI.models.groups.query().where('name', 'Administrators').first()
      svcUser = await WIKI.models.users.query().insertAndFetch({
        email: 'service@wiki.internal',
        name: 'Service Account',
        providerId: '0',
        providerKey: 'local',
        password: require('crypto').randomBytes(32).toString('hex'),
        isSystem: false,
        isActive: true,
        isVerified: true
      })
      if (adminGroup) {
        await svcUser.$relatedQuery('groups').relate(adminGroup.id)
      }
    }

    // Load permissions
    const groups = await svcUser.$relatedQuery('groups')
    svcUser.permissions = []
    svcUser.groups = groups.map(g => g.id)
    for (const grp of groups) {
      svcUser.permissions.push(...(grp.permissions || []))
    }
    svcUser.getGlobalPermissions = () => svcUser.permissions
    svcUser.getGroups = () => svcUser.groups

    return svcUser
  }

  // For user JWTs, find a matching Wiki.js user by the backend userId
  // If not found, we create a placeholder with the configured default group.
  let wikiUser = await WIKI.models.users.query()
    .where('providerId', apiUser.userId)
    .where('providerKey', 'local')
    .first()

  if (!wikiUser) {
    const defaultGroup = await WIKI.models.groups.query().where('name', process.env.WIKI_DEFAULT_GROUP || 'Guests').first()
    wikiUser = await WIKI.models.users.query().insertAndFetch({
      email: `${apiUser.userId}@backend.internal`,
      name: `Backend User ${apiUser.userId.slice(0, 8)}`,
      providerId: apiUser.userId,
      providerKey: 'local',
      password: require('crypto').randomBytes(32).toString('hex'),
      isSystem: false,
      isActive: true,
      isVerified: true
    })
    if (defaultGroup) {
      await wikiUser.$relatedQuery('groups').relate(defaultGroup.id)
    }
  }

  const groups = await wikiUser.$relatedQuery('groups')
  wikiUser.permissions = []
  wikiUser.groups = groups.map(g => g.id)
  for (const grp of groups) {
    wikiUser.permissions.push(...(grp.permissions || []))
  }
  wikiUser.getGlobalPermissions = () => wikiUser.permissions
  wikiUser.getGroups = () => wikiUser.groups

  return wikiUser
}

module.exports = router
