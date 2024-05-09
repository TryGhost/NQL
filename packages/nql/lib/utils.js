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
 * @param {Object} mongoJSON - The MongoDB query object.
 * @returns {Object} - The modified MongoDB query object.
 */
const combineNeFilters = (mongoJSON) => {
    // this should only be necessary when we have '$and' with multiple child '$ne' filters of the same type
    if (mongoUtils.findStatement(mongoJSON, '$ne') && mongoJSON.$and) {
        const andFilters = mongoJSON.$and;
        const neFilters = andFilters.filter(filter => mongoUtils.findStatement(filter, '$ne'));
        const neGroups = _.groupBy(neFilters, filter => Object.keys(filter)[0]);
        const neKeys = Object.keys(neGroups);
        const neKeysWithMultipleFilters = neKeys.filter(key => neGroups[key].length > 1);
        neKeysWithMultipleFilters.forEach((key) => {
            const neValues = neGroups[key].map(filter => filter[key].$ne);
            mongoJSON[key] = {$nin: neValues};
            neGroups[key].forEach((filter) => {
                andFilters.splice(andFilters.indexOf(filter), 1);
            });
        });
        if (andFilters.length === 0) {
            delete mongoJSON.$and;
        }
    }
    return mongoJSON;
};

module.exports = {
    mergeFilters: mongoUtils.mergeFilters,
    parseExpansions: parseExpansions,
    expandFilters: expandFilters,
    combineNeFilters: combineNeFilters
};
