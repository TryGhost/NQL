const config = require('../../../config');

module.exports = () => require('knex')(config.get('database'));
