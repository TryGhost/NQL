/**
 * Utility functions for working with MongoDB queries and expansions.
 * @module utils
 */

const mongoUtils = require('@tryghost/mongo-utils');
const nqlLang = require('@tryghost/nql-lang');
const _ = require('lodash');

/**
 * Parses the expansions object and converts the expansion strings into parsed NQL expressions.
 * @param {Object} expansions - The expansions object.
 * @returns {Object[]} - The parsed expansions.
 */
const parseExpansions = (expansions) => {
    if (!expansions || Object.keys(expansions).length === 0) {
        return expansions;
    }

    return expansions.map((expansion) => {
        const parsed = Object.assign({}, expansion);

        if (parsed.expansion) {
            parsed.expansion = nqlLang.parse(expansion.expansion);
        }

        return parsed;
    });
};

/**
 * Expands the filters in the given MongoDB query using the provided expansions.
 * @param {Object} mongoJSON - The MongoDB query object.
 * @param {Object[]} expansions - The parsed expansions.
 * @returns {Object} - The expanded MongoDB query object.
 */
const expandFilters = (mongoJSON, expansions) => {
    const parsedExpansions = parseExpansions(expansions);

    return mongoUtils.expandFilters(mongoJSON, parsedExpansions);
};

/**
 * Combines multiple '$ne' filters of the same type within an '$and' operator into a single '$nin' filter.
 * Can handle nested '$and' operators.
 *
 * @param {Object} mongoJSON - The MongoDB query object.
 * @returns {Object} - The modified MongoDB query object.
 */
const combineNeFilters = (mongoJSON) => {
    // Early return if there is no '$and' or no '$ne' filters to process
    if (!mongoJSON.$and || !mongoUtils.findStatement(mongoJSON, '$ne')) {
        return mongoJSON;
    }

    const andFilters = mongoJSON.$and;

    // Extract all filters containing '$ne' and group them by their keys
    const neFilters = andFilters.filter(filter => mongoUtils.findStatement(filter, '$ne'));
    const neGroups = _.groupBy(neFilters, filter => Object.keys(filter)[0]);

    // Filter for keys that have multiple '$ne' filters
    const neKeysWithMultipleFilters = Object.keys(neGroups).filter(key => neGroups[key].length > 1);

    // Process each key with multiple '$ne' filters
    neKeysWithMultipleFilters.forEach((key) => {
        const neValues = neGroups[key].map(filter => filter[key].$ne).filter(value => value !== undefined);

        // If no valid '$ne' values, skip this group
        if (neValues.length === 0) {
            return;
        }

        // Replace multiple '$ne' with a single '$nin' and remove original filters
        mongoJSON[key] = {$nin: neValues};
        neGroups[key].forEach((filter) => {
            const index = andFilters.indexOf(filter);
            if (index > -1) {
                andFilters.splice(index, 1);
            }
        });
    });

    // Clean up the '$and' filter if it's empty after processing
    if (andFilters.length === 0) {
        delete mongoJSON.$and;
    }

    // Recursively process nested '$and' filters
    for (const key in mongoJSON) {
        if (key === '$and') {
            mongoJSON[key] = mongoJSON[key].map(combineNeFilters);
        }
    }

    return mongoJSON;
};

const isOp = key => key.charAt(0) === '$';

/**
 * Expands the `$all` operator into an `$and` of equality clauses.
 *
 * `field:[a+b]` parses to `{field: {$all: [a, b]}}`. There is no native `$all`
 * in the SQL/mingo layers, but "match every value" is exactly an `$and` of
 * single-value equality clauses on the same field — which mongo-knex already
 * turns into a separate subquery per value for many-to-many relations (has ALL),
 * and which mingo matches against array fields the same way. Rewriting here lets
 * both query paths reuse that proven behaviour without special-casing `$all`.
 *
 * @param {*} node - A MongoDB query node (object, array or primitive).
 * @returns {*} - The node with any `$all` operators expanded.
 */
const expandAllFilters = (node) => {
    if (_.isArray(node)) {
        return node.map(expandAllFilters);
    }

    if (!_.isPlainObject(node)) {
        return node;
    }

    const keys = Object.keys(node);

    // CASE: a lone `{field: {$all: [...]}}` becomes `{$and: [{field: a}, ...]}`
    if (keys.length === 1) {
        const key = keys[0];
        const value = node[key];

        if (!isOp(key)
            && _.isPlainObject(value)
            && Object.keys(value).length === 1
            && _.isArray(value.$all)
        ) {
            return {$and: value.$all.map(item => ({[key]: item}))};
        }
    }

    // Otherwise recurse so nested `$all` (e.g. inside `$and`/`$or`) is expanded too
    return _.mapValues(node, expandAllFilters);
};

module.exports = {
    mergeFilters: mongoUtils.mergeFilters,
    parseExpansions: parseExpansions,
    expandFilters: expandFilters,
    combineNeFilters: combineNeFilters,
    expandAllFilters: expandAllFilters
};
