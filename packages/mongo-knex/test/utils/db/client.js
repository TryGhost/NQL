const knex = require('./knex');

module.exports = (conn) => {
    if (process.env.DB_CLIENT && Object.keys(knex).includes(process.env.DB_CLIENT)) {
        return knex[process.env.DB_CLIENT](conn);
    }

    return knex.sqlite(conn);
};
