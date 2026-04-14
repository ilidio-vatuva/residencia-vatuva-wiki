exports.up = async knex => {
  await knex.schema.alterTable('pages', table => {
    table.uuid('projectId').nullable().index()
    table.uuid('phaseId').nullable().index()
    table.uuid('taskId').nullable().index()
  })
}

exports.down = async knex => {
  await knex.schema.alterTable('pages', table => {
    table.dropColumn('projectId')
    table.dropColumn('phaseId')
    table.dropColumn('taskId')
  })
}
