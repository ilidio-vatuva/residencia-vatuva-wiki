const Knex = require('knex')
const yaml = require('js-yaml')
const fs = require('fs')
const config = yaml.load(fs.readFileSync('./config.yml', 'utf8'))
const knex = Knex({ client: 'pg', connection: { host: config.db.host, port: config.db.port, user: config.db.user, password: config.db.pass, database: config.db.db } })

async function main() {
  const u = await knex('users').where('providerId', 'd83114bb-b091-4f8e-a6b9-703813f8f307').first()
  if (!u) { console.log('User NOT FOUND'); return }
  console.log('User:', { id: u.id, name: u.name, email: u.email, isActive: u.isActive, isVerified: u.isVerified, providerKey: u.providerKey })

  const groups = await knex('userGroups').where('userId', u.id)
  console.log('Group memberships:', groups)

  for (const g of groups) {
    const group = await knex('groups').where('id', g.groupId).first()
    console.log('Group:', { id: group.id, name: group.name, permissions: group.permissions, pageRules: JSON.stringify(group.pageRules) })
  }

  // Also check if Users group exists at all
  const usersGroup = await knex('groups').where('name', 'Users').first()
  if (usersGroup) {
    console.log('\nUsers group:', { id: usersGroup.id, permissions: usersGroup.permissions, pageRules: JSON.stringify(usersGroup.pageRules) })
  } else {
    console.log('\nUsers group DOES NOT EXIST')
  }

  knex.destroy()
}
main().catch(err => { console.error(err.message); knex.destroy() })
