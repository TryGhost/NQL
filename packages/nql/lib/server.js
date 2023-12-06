const mongoKnex = require('@tryghost/mongo-knex');
const coreNql = require('./core');

module.exports = (queryString, options = {}) => {
    const api = coreNql(queryString, options);

    // Use MongoKnex to apply the query to a query builder object
    api.querySQL = qb => mongoKnex(qb, api.parse(), options);

    return api;
};

module.exports.utils = {
    mapQuery: require('@tryghost/mongo-utils').mapQuery,
    mapKeyValues: require('@tryghost/mongo-utils').mapKeyValues
};
