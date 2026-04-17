const md = require('markdown-it')
const { full: mdEmoji } = require('markdown-it-emoji')
const { JSDOM } = require('jsdom')
const createDOMPurify = require('dompurify')
const _ = require('lodash')
const { AkismetClient } = require('akismet-api')
const moment = require('moment')

/* global WIKI */

const window = new JSDOM('').window
const DOMPurify = createDOMPurify(window)

let akismetClient = null

const mkdown = md({
  html: false,
  breaks: true,
  linkify: true,
  highlight(str, lang) {
    return `<pre><code class="language-${lang}">${_.escape(str)}</code></pre>`
  }
})

mkdown.use(mdEmoji)

// Mention plugin: render @Name as a styled span
mkdown.core.ruler.after('inline', 'mention', (state) => {
  for (const token of state.tokens) {
    if (token.type !== 'inline' || !token.children) continue
    const newChildren = []
    for (const child of token.children) {
      if (child.type !== 'text' || !child.content.includes('@')) {
        newChildren.push(child)
        continue
      }
      // Split text on @mentions (supports @Word, @Two Words via @"Two Words", or @CamelCase)
      const parts = child.content.split(/(@[\w\u00C0-\u024F]+(?:\s[\w\u00C0-\u024F]+)?)/u)
      for (const part of parts) {
        if (/^@[\w\u00C0-\u024F]+/u.test(part)) {
          const openToken = new state.Token('html_inline', '', 0)
          openToken.content = `<span class="comment-mention" style="color:#1976d2;font-weight:600">${md.utils.escapeHtml(part)}</span>`
          newChildren.push(openToken)
        } else if (part.length > 0) {
          const textToken = new state.Token('text', '', 0)
          textToken.content = part
          newChildren.push(textToken)
        }
      }
    }
    token.children = newChildren
  }
})

// ------------------------------------
// Default Comment Provider
// ------------------------------------

module.exports = {
  /**
   * Init
   */
  async init (config) {
    WIKI.logger.info('(COMMENTS/DEFAULT) Initializing...')
    if (WIKI.data.commentProvider.config.akismet && WIKI.data.commentProvider.config.akismet.length > 2) {
      akismetClient = new AkismetClient({
        key: WIKI.data.commentProvider.config.akismet,
        blog: WIKI.config.host,
        lang: WIKI.config.lang.namespacing ? WIKI.config.lang.namespaces.join(', ') : WIKI.config.lang.code,
        charset: 'UTF-8'
      })
      try {
        const isValid = await akismetClient.verifyKey()
        if (!isValid) {
          akismetClient = null
          WIKI.logger.warn('(COMMENTS/DEFAULT) Akismet Key is invalid! [ DISABLED ]')
        } else {
          WIKI.logger.info('(COMMENTS/DEFAULT) Akismet key is valid. [ OK ]')
        }
      } catch (err) {
        akismetClient = null
        WIKI.logger.warn('(COMMENTS/DEFAULT) Unable to verify Akismet Key: ' + err.message)
      }
    } else {
      akismetClient = null
    }
    WIKI.logger.info('(COMMENTS/DEFAULT) Initialization completed.')
  },
  /**
   * Create New Comment
   */
  async create ({ page, replyTo, content, user }) {
    // -> Build New Comment
    const newComment = {
      content,
      render: DOMPurify.sanitize(mkdown.render(content)),
      replyTo,
      pageId: page.id,
      authorId: user.id,
      name: user.name,
      email: user.email,
      ip: user.ip
    }

    // -> Check for Spam with Akismet
    if (akismetClient) {
      let userRole = 'user'
      if (user.groups.indexOf(1) >= 0) {
        userRole = 'administrator'
      } else if (user.groups.indexOf(2) >= 0) {
        userRole = 'guest'
      }

      let isSpam = false
      try {
        isSpam = await akismetClient.checkSpam({
          ip: user.ip,
          useragent: user.agentagent,
          content,
          name: user.name,
          email: user.email,
          permalink: `${WIKI.config.host}/${page.localeCode}/${page.path}`,
          permalinkDate: page.updatedAt,
          type: (replyTo > 0) ? 'reply' : 'comment',
          role: userRole
        })
      } catch (err) {
        WIKI.logger.warn('Akismet Comment Validation: [ FAILED ]')
        WIKI.logger.warn(err)
      }

      if (isSpam) {
        throw new Error('Comment was rejected because it is marked as spam.')
      }
    }

    // -> Check for minimum delay between posts
    if (WIKI.data.commentProvider.config.minDelay > 0) {
      const lastComment = await WIKI.models.comments.query().select('updatedAt').findOne('authorId', user.id).orderBy('updatedAt', 'desc')
      if (lastComment && moment().subtract(WIKI.data.commentProvider.config.minDelay, 'seconds').isBefore(lastComment.updatedAt)) {
        throw new Error('Your administrator has set a time limit before you can post another comment. Try again later.')
      }
    }

    // -> Save Comment to DB
    const cm = await WIKI.models.comments.query().insert(newComment)

    // -> Return Comment ID
    return cm.id
  },
  /**
   * Update an existing comment
   */
  async update ({ id, content, user }) {
    const renderedContent = DOMPurify.sanitize(mkdown.render(content))
    await WIKI.models.comments.query().findById(id).patch({
      content,
      render: renderedContent
    })
    return renderedContent
  },
  /**
   * Delete an existing comment by ID
   */
  async remove ({ id, user }) {
    return WIKI.models.comments.query().findById(id).delete()
  },
  /**
   * Get the page ID from a comment ID
   */
  async getPageIdFromCommentId (id) {
    const result = await WIKI.models.comments.query().select('pageId').findById(id)
    return (result) ? result.pageId : false
  },
  /**
   * Get a comment by ID
   */
  async getCommentById (id) {
    return WIKI.models.comments.query().findById(id)
  },
  /**
   * Get the total comments count for a page ID
   */
  async count (pageId) {
    const result = await WIKI.models.comments.query().count('* as total').where('pageId', pageId).first()
    return _.toSafeInteger(result.total)
  }
}
