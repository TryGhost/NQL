const nql = require('@tryghost/nql-lang');
const {Context, OperatorType} = require('mingo/core');
const mingo = require('mingo/query');
const utils = require('./utils');

const {$and, $eq, $gt, $gte, $in, $lt, $lte, $ne, $nin, $not, $or, $regex} = require('mingo/operators/query');

const context = new Context({
    [OperatorType.QUERY]: {$and, $or, $eq, $ne, $gt, $gte, $lt, $lte, $in, $nin, $regex, $not}
});

module.exports = (queryString, options = {}) => {
    const api = {};

    // Convert the string to tokens - useful for testing / debugging, maybe for validating?
    api.lex = () => nql.lex(queryString);

    // Parse converts to mongo JSON and caches the result
    api.parse = function () {
        if (!this.filter && queryString) {
            this.filter = nql.parse(queryString);
            if (options.transformer) {
                this.filter = options.transformer(this.filter);
            }
        }

        let overrides;
        let defaults;

        if (options.overrides) {
            overrides = nql.parse(options.overrides);
        }

        if (options.defaults) {
            defaults = nql.parse(options.defaults);
        }

        let mongoJSON = utils.mergeFilters(overrides, this.filter, defaults);

        if (options.expansions) {
            mongoJSON = utils.expandFilters(mongoJSON, options.expansions);
        }

        return mongoJSON;
    };

    // Use Mingo to apply the query to a JSON object
    // @TODO rethink this naming
    api.queryJSON = function (obj) {
        this.query = this.query || new mingo.Query(api.parse(), {
            useGlobalContext: false,
            context
        });
        return this.query.test(obj);
    };

    // Only implemented on the server
    api.querySQL = () => {
        // eslint-disable-next-line no-restricted-syntax
        throw new Error('querySQL is not implemented in the browser');
    };

    // Get back the original query string
    api.toString = () => queryString;

    // Alias parse as toJSON()
    api.toJSON = api.parse;

    return api;
};

module.exports.utils = {
    mapQuery: require('@tryghost/mongo-utils').mapQuery,
    mapKeyValues: require('@tryghost/mongo-utils').mapKeyValues
};
