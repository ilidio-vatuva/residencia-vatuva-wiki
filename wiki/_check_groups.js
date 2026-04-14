const Knex = require('knex')
const yaml = require('js-yaml')
const fs = require('fs')
const config = yaml.load(fs.readFileSync('./config.yml', 'utf8'))
const knex = Knex({ client: 'pg', connection: { host: config.db.host, port: config.db.port, user: config.db.user, password: config.db.pass, database: config.db.db } })

async function main() {
  const groups = await knex('groups').select('id', 'name', 'permissions', 'pageRules')
  groups.forEach(g => console.log(JSON.stringify(g, null, 2)))
  knex.destroy()
}
main().catch(err => { console.error(err.message); knex.destroy() })
