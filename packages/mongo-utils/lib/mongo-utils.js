const _ = require('lodash');

const GROUPS = ['$and', '$or'];

/**
 * Combines two filters with $and conjunction
 */
const combineFilters = (primary, secondary) => {
    if (_.isEmpty(primary)) {
        return secondary;
    }

    if (_.isEmpty(secondary)) {
        return primary;
    }

    return {
        $and: [primary, secondary]
    };
};

const findStatement = (statements, match) => {
    return _.some(statements, (value, key, obj) => {
        if (key === '$and') {
            return findStatement(obj.$and, match);
        } else if (key === '$or') {
            return findStatement(obj.$or, match);
        } else {
            if ((key !== match) && _.isObject(value)) {
                return findStatement(value, match);
            } else {
                return (key === match);
            }
        }
    });
};

/**
 * ## Reject statements
 *
 * Removes statements keys when matching `func` returns true
 * in the primary filter, e.g.:
 *
 * In NQL results equivalent to:
 * ('featured:true', 'featured:false') => ''
 * ('featured:true', 'featured:false,status:published') => 'status:published'
 */
const rejectStatements = (statements, func) => {
    if (!statements) {
        return statements;
    }

    GROUPS.forEach((group) => {
        if (_.has(statements, group)) {
            statements[group] = rejectStatements(statements[group], func);

            if (statements[group].length === 0) {
                delete statements[group];
            }
        }
    });

    if (_.isArray(statements)) {
        statements = statements
            .map((statement) => {
                return rejectStatements(statement, func);
            })
            .filter((statement) => {
                return !(_.isEmpty(statement));
            });
    } else {
        Object.keys(statements).forEach((key) => {
            if (!GROUPS.includes(key) && func(key)) {
                delete statements[key];
            }
        });
    }

    return statements;
};

/**
 * ## Merge Filters
 * Util to combine multiple filters based on the priority how
 * they are passed into the method. For example:
 *      mergeFilter(overrides, custom, defaults);
 * would merge these three filters having overrides on highers priority
 * and defaults on the lowest priority
 */
const mergeFilters = (...filters) => {
    let merged = {};

    filters
        .filter(filter => (!!filter)) // CASE: remove empty arguments if any
        .forEach((filter) => {
            if (filter && Object.keys(filter).length > 0) {
                filter = rejectStatements(filter, (statement) => {
                    return findStatement(merged, statement);
                });

                if (filter) {
                    merged = merged ? combineFilters(merged, filter) : filter;
                }
            }
        });

    return merged;
};

/**
 * ## Expand Filters
 * Util that expands Mongo JSON statements with custom statements
 */
const expandFilters = (statements, expansions) => {
    const expand = (primary, secondary) => {
        // CASE: we don't want to have separate $and groups when expanding
        //       all statements should be withing the same group
        if (secondary.$and) {
            return {$and: [
                primary,
                ...secondary.$and
            ]};
        }

        return {$and: [
            primary,
            secondary
        ]};
    };

    let processed = {};

    Object.keys(statements).forEach((key) => {
        if (GROUPS.includes(key)) {
            processed[key] = statements[key]
                .map(statement => expandFilters(statement, expansions));
        } else {
            const expansion = _.find(expansions, {key});

            if (expansion) {
                let replaced = {};
                replaced[expansion.replacement] = statements[key];

                if (expansion.expansion) {
                    replaced = expand(replaced, expansion.expansion);
                }

                processed = _.merge(processed, replaced);
            } else {
                processed = _.merge(processed, _.pick(statements, key));
            }
        }
    });

    return processed;
};

module.exports = {
    combineFilters: combineFilters,
    findStatement: findStatement,
    rejectStatements: rejectStatements,
    mergeFilters: mergeFilters,
    expandFilters: expandFilters
};
