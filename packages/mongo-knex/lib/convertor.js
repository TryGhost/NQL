const _ = require('lodash');
const debug = require('debug')('mongo-knex:converter');
const debugExtended = require('debug')('mongo-knex:converter-extended');

const logicOps = [
    '$and',
    '$or'
];

const compOps = {
    $eq: '=',
    $ne: '!=',
    $gt: '>',
    $gte: '>=',
    $lt: '<',
    $lte: '<=',
    $in: 'in',
    $nin: 'not in',
    $regex: 'like',
    $not: 'not like'
};

// Operator complements, used to invert an aggregate predicate: NOT (x $op y) === x $complement y.
// The key set doubles as the list of operators supported for aggregate relations - they compare
// a computed numeric value (e.g. a related-row count) rather than a column, so only these make sense
const complementOps = {
    $eq: '$ne',
    $ne: '$eq',
    $gt: '$lte',
    $gte: '$lt',
    $lt: '$gte',
    $lte: '$gt',
    $in: '$nin',
    $nin: '$in'
};

// SQL templates for the supported aggregate functions, ?? is bound to the configured column.
// Only functions where "no related rows" is equivalent to an aggregate value of 0 are
// supported - min/max/avg are NULL over no rows, which would break the zero-count inversion
const aggregateFunctions = {
    count: 'count(??)',
    countDistinct: 'count(distinct ??)',
    sum: 'sum(??)'
};

// We don't use a backslash as escpae character, because knex reescapes backslashes in binded parameters
const likeEscapeCharacter = '*';

const isOp = key => key.charAt(0) === '$';
const isLogicOp = key => isOp(key) && _.includes(logicOps, key);
const isCompOp = key => isOp(key) && _.includes(_.keys(compOps), key);
const isNegationOp = key => isOp(key) && _.includes(['$ne', '$nin'], key);
const isRangeOp = key => isOp(key) && _.includes(['$gt', '$gte', '$lt', '$lte'], key);
const isStatementGroupOp = key => _.includes([compOps.$in, compOps.$nin], key);
const isAggregateCompOp = key => Boolean(complementOps[key]);

// Aggregate values must be numeric: the inversion decision below evaluates the predicate
// at 0 in JS, so a value the database would coerce differently (null, '', '2abc') must be
// rejected up front or the two evaluations can disagree. Arrays are only meaningful for
// the set operators - bound to a scalar comparison they render invalid SQL (e.g. `> 1, 2`)
const isNumericScalar = value => (_.isNumber(value) && Number.isFinite(value))
    || (_.isString(value) && value.trim() !== '' && Number.isFinite(Number(value)));
const isAggregateValue = (op, value) => {
    if (op === '$in' || op === '$nin') {
        return _.isArray(value) ? _.every(value, isNumericScalar) : isNumericScalar(value);
    }

    return isNumericScalar(value);
};

//eslint-disable-next-line ghost/ghost-custom/no-native-error
const aggregateOperatorError = relationName => new Error(`Aggregate relation "${relationName}" only supports ${Object.keys(complementOps).join(', ')} comparisons with numeric values`);

//eslint-disable-next-line ghost/ghost-custom/no-native-error
const aggregateColumnError = relationName => new Error(`Aggregate relation "${relationName}" is queried by name only, without a column (e.g. "${relationName}:0")`);

//eslint-disable-next-line ghost/ghost-custom/no-native-error
const elemMatchRelationError = key => new Error(`$elemMatch can only be used on a relation, not "${key}"`);

//eslint-disable-next-line ghost/ghost-custom/no-native-error
const elemMatchEmptyError = relationName => new Error(`$elemMatch on "${relationName}" needs at least one condition`);

//eslint-disable-next-line ghost/ghost-custom/no-native-error
const elemMatchOperatorError = (relationName, op) => new Error(`$elemMatch on "${relationName}" does not support the operator "${op}"`);

//eslint-disable-next-line ghost/ghost-custom/no-native-error
const elemMatchColumnError = (relationName, column) => new Error(`$elemMatch on "${relationName}" cannot use a dotted column ("${column}")`);

/**
 * Whether an aggregate comparison would match a parent row with no related rows
 * (aggregate value 0). Such rows don't appear in the grouped subquery at all, so
 * the subquery has to be inverted (NOT IN + complement operator) to include them.
 */
const aggregateMatchesZero = (op, value) => {
    switch (op) {
    case '$eq': return Number(value) === 0;
    case '$ne': return Number(value) !== 0;
    case '$gt': return Number(value) < 0;
    case '$gte': return Number(value) <= 0;
    case '$lt': return Number(value) > 0;
    case '$lte': return Number(value) >= 0;
    case '$in': return _.castArray(value).some(v => Number(v) === 0);
    case '$nin': return !_.castArray(value).some(v => Number(v) === 0);
    default: return false;
    }
};

/**
 * JSON Stringify with RegExp support
 * @param {Object} json
 * @returns
 */
const stringify = (json) => {
    return JSON.stringify(json, function (key, value) {
        if (value instanceof RegExp) {
            return value.toString();
        }
        return value;
    });
};

/**
 * Whether a trailing `$` anchors the pattern, rather than being a dollar in the value.
 *
 * A value containing a dollar arrives escaped, as `5\$`, which still ends in `$`. An odd run
 * of backslashes before it means it is escaped and so part of the value.
 */
const hasEndAnchor = (source) => {
    if (!source.endsWith('$')) {
        return false;
    }

    let backslashes = 0;

    for (let index = source.length - 2; index >= 0 && source[index] === '\\'; index -= 1) {
        backslashes += 1;
    }

    return backslashes % 2 === 0;
};

const processRegExp = ({source, ignoreCase}) => {
    // A regexp is transformed into a LIKE SQL query.
    // We don't support any special regexp operators apart from startsWith and endsWith (or both).
    //
    // The anchors have to be read before the escaped characters are removed, not after. A value
    // holding a literal `^` or `$` reaches here escaped — `\^abc`, `abc\$` — and unescaping
    // first makes it indistinguishable from the anchor of the same name, so `contains 'abc$'`
    // would compile to the same LIKE pattern as `endsWith 'abc'`.
    const startAnchor = source.startsWith('^');
    const endAnchor = hasEndAnchor(source);

    source = source.slice(startAnchor ? 1 : 0, endAnchor ? -1 : undefined);

    // Now that the anchors are accounted for, what is left is the value itself.
    source = source.replace(/\\([.*+?^${}()|[\]\\/])/g, '$1');

    if (ignoreCase) {
        source = source.toLowerCase();
    }

    // Escape escape character itself
    source = source.replace(new RegExp(_.escapeRegExp(likeEscapeCharacter), 'g'), likeEscapeCharacter + likeEscapeCharacter);

    // Escape special LIKE characters (% and _)
    source = source.replace(/%/g, likeEscapeCharacter + '%');
    source = source.replace(/_/g, likeEscapeCharacter + '_');

    // For starts with and ends with in SQL we have to put the wildcard at the opposite end of
    // the string to the regex symbol!
    // Anchored at both ends is an exact match, so it takes no wildcard at all.
    if (!startAnchor) {
        source = '%' + source;
    }

    if (!endAnchor) {
        source = source + '%';
    }

    return {source, ignoreCase};
};

class MongoToKnex {
    /**
     *
     * @param {Object} options
     * @param {String} options.tableName
     *
     * @param {Object} config
     * @param {Object} config.relations structure:
     *  {[relation-name]}: {
     *      tableName: String (e.g. tags)
     *      tableNameAs: String (e.g. t, optional)
     *      type: String (e.g. manyToMany)
     *      joinTable: String (e.g.  posts_tags)
     *      joinFrom: String (e.g. post_id)
     *      joinTo: String (e.g. tag_id)
     *  }
     *
     * `aggregate` relations compare a computed value over related rows instead of
     * a column, so they are queried by bare relation name, e.g. `tag_count:>1` -
     * what is computed is defined by the relation config:
     *  {[relation-name]}: {
     *      type: 'aggregate'
     *      aggregate: {fn: String (e.g. countDistinct), column: String (e.g. posts_tags.tag_id)}
     *      tableName: String (e.g. posts_tags) - table holding the related rows
     *      tableNameAs: String (optional) - alias for tableName, e.g. for self-joins
     *      joinFrom: String (e.g. post_id) - column on tableName referencing the parent table's id
     *      joins: [{tableName, tableNameAs (optional), from, to}] (optional) - chain of joins needed to qualify rows
     *      wheres: {[column]: value} (optional) - fixed conditions a related row must meet to be counted
     *  }
     *
     * When tableNameAs is used, aggregate.column and wheres must reference the alias.
     */
    constructor(options = {}, config = {}) {
        this.tableName = options.tableName;
        this.cte = config.cte;
        this.config = {};

        Object.assign(this.config, {relations: {}}, config);
    }

    /**
     * Apply one comparison to a query builder. A regex reaches here only via a relation
     * subquery — the top-level path handles it in buildComparison — so it is converted
     * to the same LIKE-with-ESCAPE form that contains/startsWith/endsWith use, so they
     * work on a related column too. Everything else is the plain
     * `qb[whereType](column, op, value)` call.
     */
    applyComparison(builder, whereType, column, op, value) {
        if (value instanceof RegExp) {
            const {source, ignoreCase} = processRegExp(value);
            const lhs = ignoreCase ? 'lower(??)' : '??';
            return builder[`${whereType}Raw`](`${lhs} ${op} ? ESCAPE ?`, [column, source, likeEscapeCharacter]);
        }

        return builder[whereType](column, op, value);
    }

    processWhereType(mode, op, value) {
        if (value === null) {
            return (mode === '$or' ? 'orWhere' : 'where') + (op === '$ne' ? 'NotNull' : 'Null');
        }

        if (mode === '$or') {
            return 'orWhere';
        }

        return 'andWhere';
    }

    /**
     * Determine if statement lives on parent table or if statement refers to a relation.
     */
    processStatement(column, op, value) {
        const [tableName, columnName] = column.split('.');

        // CASE: relation?
        if (columnName) {
            debug(tableName, columnName);

            const table = tableName;
            let relation = this.config.relations[table];

            // CASE: aggregate relations compare a single computed value, there is no
            //       column to select - a dotted suffix is meaningless and only invites
            //       aliased spellings of the same query, so it's rejected outright
            if (relation && relation.type === 'aggregate') {
                throw aggregateColumnError(table);
            }

            if (!relation) {
                // CASE: you want to filter by a column on the join table
                relation = _.find(this.config.relations, (_relation) => {
                    return _relation.joinTable === table;
                });

                // CASE: assume it's a column on the destination table
                if (!relation) {
                    return {
                        column: column,
                        operator: op,
                        value: value,
                        isRelation: false
                    };
                }

                return {
                    joinTable: relation.joinTable,
                    table: relation.tableName,
                    column: columnName,
                    operator: op,
                    value: value,
                    config: relation,
                    isRelation: true
                };
            }

            return {
                table: tableName,
                column: columnName,
                operator: op,
                value: value,
                config: relation,
                isRelation: true
            };
        }

        // CASE: aggregate relations are queried by bare name (e.g. `tag_count:>1`),
        //       the relation config takes precedence over a parent table column of
        //       the same name
        const aggregateRelation = this.config.relations[column];
        if (aggregateRelation && aggregateRelation.type === 'aggregate') {
            return {
                table: column,
                column: null,
                operator: op,
                value: value,
                config: aggregateRelation,
                isRelation: true
            };
        }

        // CASE: fallback, status=draft -> posts.status=draft
        return {
            column: (this.cte && this.cte === true) ? `${column}` : `${this.tableName}.${column}`,
            operator: op,
            value: value,
            isRelation: false
        };
    }

    /**
     * We group the relations by a unique key.
     * Each grouping will create a sub query.
     *
     * Returns a group structure of following format:
     *  {
     *      "groupKey": {
     *          innerWhereStatements: [],
     *          joinFilterStatements: []
     *      }
     *  }
     */
    groupRelationStatements(statements, mode) {
        const group = {};

        // groups depend on the mode of grouping, if its and $and we need to treat a filter on
        // joining table differently than we would with $or
        // e.g. for $or we can create a subquery or group that filter,
        //      for $and we have to include joining table filter in every group
        const innerWhereStatements = (mode === '$and')
            ? statements.filter(r => !(r.joinTable))
            : statements;

        _.each(innerWhereStatements, (statement, idx) => {
            /**
             * CASE:
             * - we should not use the same sub query if the column name is the same (two sub queries)
             * - e.g. $and conjunction requires us to use 2 sub queries, because we have to look at each individual tag
             *
             * - we should also not use grouping of negated values for the same reasons as above
             *
             * - aggregate relations are the exception: every condition compares the same single
             *   computed value per parent row, so all conditions belong in one subquery with a
             *   combined HAVING - the "must match a different row" reasoning doesn't apply
             */
            const isAggregate = statement.config && statement.config.type === 'aggregate';

            // CASE: all conditions of one `$elemMatch` must match a single related
            //       row, so they share a subquery keyed by the match's id regardless
            //       of operator - the "a negation matches a different row" reasoning
            //       below never applies to them. This is the explicit same-row escape
            //       hatch: everything outside an $elemMatch keeps the default grouping.
            if (statement.elemMatchGroup !== undefined) {
                const elemKey = `${statement.table}_elem_${statement.elemMatchGroup}`;

                if (!group[elemKey]) {
                    group[elemKey] = {innerWhereStatements: []};
                }

                group[elemKey].innerWhereStatements.push(statement);
                return;
            }

            let shouldCreateSubGroup = !isAggregate && isNegationOp(statement.operator);
            if (!shouldCreateSubGroup && !isAggregate && group[statement.table]) {
                shouldCreateSubGroup = _.some(group[statement.table].innerWhereStatements, (innerStatement) => {
                    if (innerStatement.column !== statement.column) {
                        return false;
                    }

                    // Range operators on the same column define a range on a single row
                    // and should stay in the same subquery (e.g. created_at >= X AND created_at <= Y).
                    // Equality/set operators need separate subqueries because each condition
                    // must match a different row in manyToMany relations.
                    if (isRangeOp(innerStatement.operator) && isRangeOp(statement.operator)) {
                        return false;
                    }

                    return true;
                });
            }

            let groupKey = statement.table;

            if (shouldCreateSubGroup) {
                groupKey = `${statement.table}_${idx})}`;

                if (group[groupKey]) {
                    //eslint-disable-next-line ghost/ghost-custom/no-native-error
                    throw new Error('Key collision detected');
                }
            }

            if (!group[groupKey]) {
                group[groupKey] = {};
                group[groupKey].innerWhereStatements = [];
            }

            group[groupKey].innerWhereStatements.push(statement);
        });

        // NOTE: filters applied on join level have to be included when they are
        // a part of $and  group
        if (mode === '$and') {
            const joinFilterStatements = statements.filter(r => (r.joinTable));

            _.each(Object.keys(group), (key) => {
                group[key].joinFilterStatements = joinFilterStatements;
            });
        }

        return group;
    }

    /**
     * Build queries for relations.
     */
    buildRelationQuery(qb, relations, mode) {
        debug(`(buildRelationQuery)`);
        // The subquery bodies below are knex callbacks where `this` is the query
        // builder, so hold onto the converter to reach its helpers from inside them.
        const self = this;

        if (debugExtended.enabled) {
            debugExtended(`(buildRelationQuery) ${stringify(relations)}`);
        }

        const groupedRelations = this.groupRelationStatements(relations, mode);

        if (debugExtended.enabled) {
            debugExtended(`(buildRelationQuery) grouped: ${stringify(groupedRelations)}`);
        }

        // CASE: {tags: [where clause, where clause], tags_123: [where clause], authors: [where clause, where clause]}
        _.each(Object.keys(groupedRelations), (key) => {
            debug(`(buildRelationQuery) build relation for ${key}`);

            const statements = groupedRelations[key].innerWhereStatements;

            // CASE: any statement for the same relation should contain the same config
            const reference = statements[0];

            if (reference.config.type === 'manyToMany') {
                if (_.every(statements.map(s => s.operator), isCompOp)) {
                    // CASE: only negate whole group when all the operators in the group are negative,
                    // otherwise we cannot combine groups with negated and regular equation operators.
                    // Two distinct negations converge on a NOT IN outer membership:
                    //   - legacyNegate: a group whose conditions are all negations (e.g. {$ne, $ne})
                    //     and no $elemMatch. By De Morgan the whole group negates, and each inner
                    //     condition flips to its positive form ($in) inside the subquery.
                    //   - elemMatchNegate: a $not-wrapped $elemMatch. The whole single-row match is
                    //     negated (parent.id NOT IN that subquery), but the conditions inside keep
                    //     their literal operators — only the outer membership flips.
                    // A positive $elemMatch negates neither: each condition applies within the one row.
                    const legacyNegate = reference.elemMatchGroup === undefined
                        && _.every(statements.map(s => s.operator), (operator) => {
                            return isNegationOp(operator);
                        });
                    const negateGroup = reference.elemMatchNegate === true || legacyNegate;

                    const comp = negateGroup
                        ? compOps.$nin
                        : compOps.$in;

                    const whereType = reference.outerWhereType || (['whereNull', 'whereNotNull'].includes(reference.whereType) ? 'andWhere' : (['orWhereNull', 'orWhereNotNull'].includes(reference.whereType) ? 'orWhere' : reference.whereType));

                    // CASE: WHERE resource.id (IN | NOT IN) (SELECT ...)
                    qb[whereType](`${this.tableName}.id`, comp, function () {
                        const joinFilterStatements = groupedRelations[key].joinFilterStatements;

                        let innerJoinValue = reference.config.tableName;
                        let innerJoinOn = `${reference.config.tableName}.${reference.config.joinToForeign || 'id'}`;

                        // CASE: you can define a name for the join table
                        if (reference.config.tableNameAs) {
                            innerJoinValue = `${reference.config.tableName} as ${reference.config.tableNameAs}`;
                            innerJoinOn = `${reference.config.tableNameAs}.${reference.config.joinToForeign || 'id'}`;
                        }

                        const joinType = reference.config.joinType || 'innerJoin';

                        const innerQB = this
                            .select(`${reference.config.joinTable}.${reference.config.joinFrom}`)
                            .from(`${reference.config.joinTable}`)[joinType](innerJoinValue, function () {
                                this.on(innerJoinOn, '=', `${reference.config.joinTable}.${reference.config.joinTo}`);

                                // CASE: when applying AND con junction and having multiple groups the filter
                                //       related to joining table has to be applied within each group
                                _.each(joinFilterStatements, (joinFilter) => {
                                    this.andOn(`${joinFilter.joinTable}.${joinFilter.column}`, compOps[joinFilter.operator], joinFilter.value);
                                });
                            });

                        if (debugExtended.enabled) {
                            debug(`(buildRelationQuery) innerQB sql-pre: ${innerQB.toSQL().sql}`);
                        }

                        _.each(statements, (statement, _key) => {
                            debug(`(buildRelationQuery) build relation where statements for ${_key}`);

                            const statementColumn = `${statement.joinTable || statement.table}.${statement.column}`;
                            let statementOp;

                            if (legacyNegate) {
                                statementOp = compOps.$in;
                            } else {
                                if (isNegationOp(statement.operator)) {
                                    statementOp = compOps.$nin;
                                } else {
                                    statementOp = compOps[statement.operator];
                                }
                            }

                            let statementValue = statement.value;

                            // CASE: need to normalize value to array when it's a group operation
                            if (isStatementGroupOp(statementOp)) {
                                statementValue = !_.isArray(statement.value) ? [statement.value] : statement.value;
                            }

                            self.applyComparison(innerQB, statement.whereType, statementColumn, statementOp, statementValue);
                        });

                        if (debugExtended.enabled) {
                            debug(`(buildRelationQuery) innerQB sql-post: ${innerQB.toSQL().sql}`);
                        }

                        return innerQB;
                    });
                } else {
                    debug(`one of ${key} group statements contains unknown operator`);
                }
            } else if (reference.config.type === 'oneToOne') {
                if (_.every(statements.map(s => s.operator), isCompOp)) {
                    // CASE: only negate whole group when all the operators in the group are negative,
                    // otherwise we cannot combine groups with negated and regular equation operators.
                    // Two distinct negations converge on a NOT IN outer membership:
                    //   - legacyNegate: a group whose conditions are all negations (e.g. {$ne, $ne})
                    //     and no $elemMatch. By De Morgan the whole group negates, and each inner
                    //     condition flips to its positive form ($in) inside the subquery.
                    //   - elemMatchNegate: a $not-wrapped $elemMatch. The whole single-row match is
                    //     negated (parent.id NOT IN that subquery), but the conditions inside keep
                    //     their literal operators — only the outer membership flips.
                    // A positive $elemMatch negates neither: each condition applies within the one row.
                    const legacyNegate = reference.elemMatchGroup === undefined
                        && _.every(statements.map(s => s.operator), (operator) => {
                            return isNegationOp(operator);
                        });
                    const negateGroup = reference.elemMatchNegate === true || legacyNegate;

                    const comp = negateGroup
                        ? compOps.$nin
                        : compOps.$in;
                    const tableName = this.tableName;

                    const where = (reference.outerWhereType || reference.whereType) === 'orWhere' ? 'orWhere' : 'where';
                    qb[where](`${this.tableName}.id`, comp, function () {
                        const joinFilterStatements = groupedRelations[key].joinFilterStatements;

                        let innerJoinValue = reference.config.tableName;
                        let innerJoinOn = `${reference.config.tableName}.${reference.config.joinFrom}`;

                        // CASE: you can define a name for the join table
                        if (reference.config.tableNameAs) {
                            innerJoinValue = `${reference.config.tableName} as ${reference.config.tableNameAs}`;
                            innerJoinOn = `${reference.config.tableNameAs}.${reference.config.joinFrom}`;
                        }

                        const innerQB = this
                            .select(`${tableName}.id`)
                            .from(`${tableName}`)
                            .leftJoin(innerJoinValue, function () {
                                this.on(innerJoinOn, '=', `${tableName}.id`);

                                // CASE: when applying AND con junction and having multiple groups the filter
                                //       related to joining table has to be applied within each group
                                _.each(joinFilterStatements, (joinFilter) => {
                                    this.andOn(`${joinFilter.joinTable}.${joinFilter.column}`, compOps[joinFilter.operator], joinFilter.value);
                                });
                            });

                        _.each(statements, (statement, _key) => {
                            debug(`(buildRelationQuery) build relation where statements for ${_key}`);

                            const statementColumn = `${statement.table}.${statement.column}`;
                            let statementOp;

                            // NOTE: this null flip ensures records with no relation are included in a
                            //       De Morgan negation (e.g. `relation.columnName: {$ne: null}`). A
                            //       $not $elemMatch keeps its conditions literal, so it does not flip.
                            if (legacyNegate) {
                                statementOp = compOps.$in;

                                if (statement.value === null) {
                                    statement.whereType = (statement.whereType === 'whereNotNull') ? 'whereNull' : 'whereNotNull';
                                }
                            } else {
                                if (isNegationOp(statement.operator)) {
                                    statementOp = compOps.$nin;
                                } else {
                                    statementOp = compOps[statement.operator];
                                }
                            }

                            let statementValue = statement.value;

                            // CASE: need to normalize value to array when it's a group operation
                            if (isStatementGroupOp(statementOp)) {
                                statementValue = !_.isArray(statement.value) ? [statement.value] : statement.value;
                            }

                            self.applyComparison(innerQB, statement.whereType, statementColumn, statementOp, statementValue);
                        });

                        if (debugExtended.enabled) {
                            debug(`(buildRelationQuery) innerQB sql-pre: ${innerQB.toSQL().sql}`);
                        }

                        return innerQB;
                    });
                } else {
                    debug(`one of ${key} group statements contains unknown operator`);
                }
            } else if (reference.config.type === 'aggregate') {
                // NOTE: operators and values were already validated by the
                //       validateAggregateStatements pre-pass in processJSON
                this.buildAggregateRelationQuery(qb, statements, reference, mode, groupedRelations[key].joinFilterStatements);
            }
        });
    }

    /**
     * Build a grouped subquery for an `aggregate` relation, e.g. for `tag_count > 1`:
     *
     *      WHERE posts.id IN (
     *          SELECT posts_tags.post_id FROM posts_tags
     *          GROUP BY posts_tags.post_id
     *          HAVING COUNT(posts_tags.tag_id) > 1
     *      )
     *
     * A parent row with no related rows does not appear in the grouped subquery at all,
     * so when the group's predicate matches an aggregate value of 0 (e.g. `count < 2`)
     * the query is inverted: NOT IN with the complement predicate (`count >= 2`). Inverting
     * the predicate also flips the conjunction between statements (De Morgan).
     */
    buildAggregateRelationQuery(qb, statements, reference, mode, joinFilterStatements) {
        const config = reference.config;

        if (!config.aggregate || !config.aggregate.fn || !config.aggregate.column) {
            //eslint-disable-next-line ghost/ghost-custom/no-native-error
            throw new Error('Aggregate relations require an aggregate config with fn and column');
        }

        const aggregateFunction = aggregateFunctions[config.aggregate.fn];

        if (!aggregateFunction) {
            //eslint-disable-next-line ghost/ghost-custom/no-native-error
            throw new Error(`Unknown aggregate function: ${config.aggregate.fn}`);
        }

        // CASE: statements within a group are combined with AND ($and) or OR ($or),
        //       so the group matches a zero aggregate when every/some statement does
        const invertSubquery = (mode === '$or')
            ? _.some(statements, s => aggregateMatchesZero(s.operator, s.value))
            : _.every(statements, s => aggregateMatchesZero(s.operator, s.value));

        const comp = invertSubquery ? compOps.$nin : compOps.$in;
        const whereType = reference.whereType === 'orWhere' ? 'orWhere' : 'where';

        // CASE: you can define a name for the aggregated table and any joined table,
        //       e.g. for self-joins or when a table appears elsewhere in the query -
        //       aggregate.column and wheres must then reference the aliases
        const baseTable = config.tableNameAs || config.tableName;
        const baseTableValue = config.tableNameAs ? `${config.tableName} as ${config.tableNameAs}` : config.tableName;

        // CASE: $and groups attach every join table filter of the group to every
        //       relation subquery - only filters on tables that are part of this
        //       subquery's join chain can restrict the aggregated rows, the others
        //       reference tables that are never joined here and are handled by their
        //       own relation's subquery
        const subqueryTables = [baseTable, ..._.map(config.joins, join => join.tableNameAs || join.tableName)];
        const applicableJoinFilters = _.filter(joinFilterStatements, joinFilter => subqueryTables.includes(joinFilter.joinTable));

        // CASE: WHERE resource.id (IN | NOT IN) (SELECT ... GROUP BY ... HAVING ...)
        qb[whereType](`${this.tableName}.id`, comp, function () {
            const innerQB = this
                .select(`${baseTable}.${config.joinFrom}`)
                .from(baseTableValue);

            // CASE: a single NULL in a NOT IN list makes the comparison UNKNOWN for every
            //       parent row, so an orphaned related row (NULL joinFrom) would silently
            //       empty the whole result set
            if (invertSubquery) {
                innerQB.whereNotNull(`${baseTable}.${config.joinFrom}`);
            }

            // CASE: qualifying related rows can live across a chain of joined tables,
            //       each join's `from` column references the `to` column of the previous table
            let previousTable = baseTable;
            _.each(config.joins, (join) => {
                const joinTable = join.tableNameAs || join.tableName;
                const joinTableValue = join.tableNameAs ? `${join.tableName} as ${join.tableNameAs}` : join.tableName;

                innerQB.innerJoin(joinTableValue, `${joinTable}.${join.from}`, `${previousTable}.${join.to}`);
                previousTable = joinTable;
            });

            // CASE: fixed conditions a related row must meet to be counted live in
            //       the relation config, they are not part of the filter input
            _.each(config.wheres, (value, column) => {
                innerQB.where(column, value);
            });

            // CASE: when applying AND conjunction, filters on a join table restrict
            //       which related rows are aggregated (same as the other relation types)
            _.each(applicableJoinFilters, (joinFilter) => {
                innerQB.where(`${joinFilter.joinTable}.${joinFilter.column}`, compOps[joinFilter.operator], joinFilter.value);
            });

            innerQB.groupBy(`${baseTable}.${config.joinFrom}`);

            _.each(statements, (statement, idx) => {
                debug(`(buildAggregateRelationQuery) build aggregate having statement for ${idx}`);

                const operator = invertSubquery ? complementOps[statement.operator] : statement.operator;
                // CASE: inverting the predicate also flips the conjunction between
                //       statements (De Morgan), hence the XOR with the mode
                const useOr = idx !== 0 && ((mode === '$or') !== invertSubquery);
                const havingType = useOr ? 'orHavingRaw' : 'havingRaw';

                // CASE: values are validated numeric but can arrive as numeric strings
                //       (e.g. quoted filter values) - they are bound as numbers so the
                //       database comparison matches the inversion decision above, which
                //       evaluates the predicate via Number() (e.g. SQLite would never
                //       coerce, an integer aggregate always sorts below any string)
                if (isStatementGroupOp(compOps[operator])) {
                    const statementValue = _.castArray(statement.value).map(Number);

                    // CASE: IN () is invalid SQL and an empty set can never match
                    if (statementValue.length === 0) {
                        innerQB[havingType]('1 = 0');
                        return;
                    }

                    const placeholders = statementValue.map(() => '?').join(', ');
                    innerQB[havingType](`${aggregateFunction} ${compOps[operator]} (${placeholders})`, [config.aggregate.column, ...statementValue]);
                } else {
                    innerQB[havingType](`${aggregateFunction} ${compOps[operator]} ?`, [config.aggregate.column, Number(statement.value)]);
                }
            });

            if (debugExtended.enabled) {
                debug(`(buildAggregateRelationQuery) innerQB sql: ${innerQB.toSQL().sql}`);
            }

            return innerQB;
        });
    }

    /**
     * Determines if statement is a simple where comparison on the parent table or if the statement is a relation query.
     *
     * e.g.
     *
     * `where column = value`
     * `where column != value`
     * `where column > value`
     */
    buildComparison(qb, mode, statement, op, value, group) {
        const comp = compOps[op] || '=';
        const processedStatement = this.processStatement(statement, op, value);
        let whereType = this.processWhereType(mode, op, value);

        debug(`(buildComparison) mode: ${mode}, op: ${op}, isRelation: ${processedStatement.isRelation}, group: ${group}`);

        // Call out to build any necessary relation queries
        if (processedStatement.isRelation) {
            processedStatement.whereType = whereType;

            // CASE: if the statement is not part of a group, execute the query instantly
            if (!group) {
                this.buildRelationQuery(qb, [processedStatement], mode);
                return;
            }

            // CASE: if the statement is part of a group, collect the relation statements to be able to group them later
            this.collectRelationStatements(qb, [processedStatement]);
            return;
        }

        // Build the comparisons using our processed data
        const column = processedStatement.column;
        op = processedStatement.operator;
        value = processedStatement.value;

        if (op === '$regex' || op === '$not') {
            const {source, ignoreCase} = processRegExp(value);
            value = source;

            // CASE: regex with i flag needs whereRaw to wrap column in lower() else fall through
            if (ignoreCase) {
                whereType += 'Raw';
                debug(`(buildComparison) whereType: ${whereType}, statement: ${statement}, op: ${op}, comp: ${comp}, value: ${value} (REGEX/i)`);
                qb[whereType](`lower(??) ${comp} ? ESCAPE ?`, [column, value, likeEscapeCharacter]);
                return;
            }
            whereType += 'Raw';
            debug(`(buildComparison) whereType: ${whereType}, statement: ${statement}, op: ${op}, comp: ${comp}, value: ${value} (REGEX)`);
            qb[whereType](`?? ${comp} ? ESCAPE ?`, [column, value, likeEscapeCharacter]);
            return;
        }

        debug(`(buildComparison) whereType: ${whereType}, statement: ${statement}, op: ${op}, comp: ${comp}, value: ${value}`);
        this.applyComparison(qb, whereType, column, comp, value);
    }

    /**
     * {author: 'carl'}
     */
    buildWhereClause(qb, mode, statement, sub, group) {
        debug(`(buildWhereClause) mode: ${mode}, statement: ${statement}`);

        if (debugExtended.enabled) {
            debugExtended(`(buildWhereClause) ${stringify(sub)}`);
        }

        // CASE sub is an atomic value, we use "eq" as default operator
        if (!_.isObject(sub)) {
            return this.buildComparison(qb, mode, statement, '$eq', sub, group);
        }

        // CASE: sub is an object, contains statements and operators
        //       (unknown operators on aggregate relations were already rejected by
        //       the validateAggregateStatements pre-pass in processJSON)
        _.forIn(sub, (value, op) => {
            if (op === '$elemMatch') {
                this.buildElemMatch(qb, mode, statement, value, group, false);
            } else if (op === '$not' && _.isObject(value) && value.$elemMatch) {
                // `{relation: {$not: {$elemMatch: {…}}}}` negates the single-row match:
                // no related row satisfies all the conditions (parent.id NOT IN …).
                this.buildElemMatch(qb, mode, statement, value.$elemMatch, group, true);
            } else if (isCompOp(op)) {
                this.buildComparison(qb, mode, statement, op, value, group);
            } else {
                debug('unknown operator');
            }
        });
    }

    /**
     * `{relation: {$elemMatch: {col: value, otherCol: {$ne: x}}}}`
     *
     * Match a single related row against all of the given conditions at once,
     * emitted as one correlated subquery (`parent.id IN (SELECT … WHERE cond AND
     * cond …)`). Without it, each condition on a multi-row relation is an
     * independent existence check - a negation in particular becomes its own
     * `NOT IN`, so a discriminator+value pair like `key = 'company' AND value != 'x'`
     * would match different rows. `$elemMatch` is the explicit way to say the whole
     * group describes one row; everything outside it keeps the default per-condition
     * grouping untouched.
     */
    buildElemMatch(qb, mode, relationName, conditions, group, negate = false) {
        // The relation, the non-empty-object shape, and the inner operators have already
        // been validated by validateElemMatchStatements during conversion, so this builds
        // from conditions it can trust.
        const collector = {};
        const elemMatchGroup = (this.elemMatchSeq = (this.elemMatchSeq || 0) + 1);

        // Inner conditions are always ANDed - a single row satisfies all of them - so
        // process them as an $and regardless of the mode the match itself sits in. Each
        // inner key names a column on the related row.
        _.forIn(conditions, (conditionValue, conditionColumn) => {
            this.buildWhereClause(collector, '$and', `${relationName}.${conditionColumn}`, conditionValue, true);
        });

        const statements = collector.relations || [];

        statements.forEach((statement) => {
            statement.elemMatchGroup = elemMatchGroup;
            statement.elemMatchNegate = negate;
        });

        // The subquery attaches to the outer query with the outer mode's conjunction.
        // Carried out-of-band on the first statement rather than overwriting its
        // whereType, which still drives its own inner comparison — a null condition
        // needs its whereNull left in place, or it degrades to `= NULL`.
        if (mode === '$or' && statements.length) {
            statements[0].outerWhereType = 'orWhere';
        }

        // CASE: not part of an outer group - attach the subquery immediately.
        if (!group) {
            this.buildRelationQuery(qb, statements, mode);
            return;
        }

        // CASE: part of a group - hand the statements to the group's relation flush
        //       so the subquery composes with sibling relation filters.
        this.collectRelationStatements(qb, statements);
    }

    // Stash relation statements on the builder for the group's deferred relation
    // flush (see buildWhereGroup), lazily creating the list on first use.
    collectRelationStatements(qb, statements) {
        if (!Object.prototype.hasOwnProperty.call(qb, 'relations')) {
            qb.relations = [];
        }
        qb.relations.push(...statements);
    }

    /**
     * {$and: [{author: 'carl'}, {status: 'draft'}]}}
     * {$and: {author: 'carl'}}
     * {$and: {author: { $in: [...] }}}
     */
    buildWhereGroup(qb, parentMode, mode, sub) {
        const whereType = this.processWhereType(parentMode);

        debug(`(buildWhereGroup) mode: ${mode}, whereType: ${whereType}`);

        if (debugExtended.enabled) {
            debugExtended(`(buildWhereGroup) ${stringify(sub)}`);
        }

        qb[whereType]((_qb) => {
            if (_.isArray(sub)) {
                sub.forEach(statement => this.buildQuery(_qb, mode, statement, true));
            } else if (_.isObject(sub)) {
                this.buildQuery(_qb, mode, sub, true);
            }

            // CASE: now execute all relation statements of this group
            if (Object.prototype.hasOwnProperty.call(_qb, 'relations')) {
                this.buildRelationQuery(_qb, _qb.relations, mode);
                delete _qb.relations;
            }
        });
    }

    buildQuery(qb, mode, sub, group) {
        debug(`(buildQuery) mode: ${mode}`);

        if (debugExtended.enabled) {
            debugExtended(`(buildQuery) ${stringify(sub)}`);
        }

        _.forIn(sub, (value, key) => {
            debug(`(buildQuery) key: ${key}`);

            if (isLogicOp(key)) {
                // CASE: you have two groups ($or), you have one group ($and)
                this.buildWhereGroup(qb, mode, key, value);
            } else {
                this.buildWhereClause(qb, mode, key, value, group);
            }
        });
    }

    /**
     * Validate every aggregate statement before any query is built. Unlike the other
     * relation types invalid aggregate statements throw instead of being silently
     * dropped - a dropped statement widens the result set, returning rows the filter
     * was meant to exclude.
     *
     * Validation is a separate pre-pass because grouped statements ($and/$or) are
     * built inside knex where-callbacks, which only run once the query is rendered -
     * a throw from there surfaces after query building has finished, escaping any
     * error handling wrapped around it (e.g. the layer turning invalid filters into
     * 4xx responses).
     */
    validateAggregateStatements(sub) {
        if (!_.isPlainObject(sub)) {
            return;
        }

        _.forIn(sub, (value, key) => {
            if (isLogicOp(key)) {
                _.castArray(value).forEach(group => this.validateAggregateStatements(group));
                return;
            }

            if (isOp(key)) {
                return;
            }

            const [relationName, columnName] = key.split('.');
            const relation = this.config.relations[relationName];

            if (!relation || relation.type !== 'aggregate') {
                return;
            }

            // CASE: same rejection as processStatement, raised here so it fires
            //       before query building for grouped statements too
            if (columnName) {
                throw aggregateColumnError(relationName);
            }

            // CASE: an atomic value (incl. arrays and regexes) is shorthand for $eq
            const statements = _.isPlainObject(value) ? value : {$eq: value};

            _.forIn(statements, (statementValue, op) => {
                if (!isAggregateCompOp(op) || !isAggregateValue(op, statementValue)) {
                    throw aggregateOperatorError(relationName);
                }
            });
        });
    }

    // Walks the filter for $elemMatch clauses (bare or wrapped in $not) and validates
    // each one. Raised here, before query building, so a match nested in an $and/$or
    // group fails at conversion rather than deep inside a knex where-callback at render
    // time — the same reason validateAggregateStatements exists.
    validateElemMatchStatements(sub) {
        if (!_.isPlainObject(sub)) {
            return;
        }

        _.forIn(sub, (value, key) => {
            if (isLogicOp(key)) {
                _.castArray(value).forEach(group => this.validateElemMatchStatements(group));
                return;
            }

            if (isOp(key) || !_.isPlainObject(value)) {
                return;
            }

            const conditions = value.$elemMatch !== undefined
                ? value.$elemMatch
                : (_.isPlainObject(value.$not) ? value.$not.$elemMatch : undefined);

            if (conditions !== undefined) {
                this.validateElemMatch(key, conditions);
            }
        });
    }

    validateElemMatch(relationName, conditions) {
        if (!this.config.relations[relationName]) {
            throw elemMatchRelationError(relationName);
        }

        // A non-object (string, number, array) would iterate as bogus columns; an empty
        // one places no constraint and silently widens the result to every parent.
        if (!_.isPlainObject(conditions) || _.isEmpty(conditions)) {
            throw elemMatchEmptyError(relationName);
        }

        _.forIn(conditions, (conditionValue, conditionColumn) => {
            // A condition names a column, not an operator: a logical or nested operator in
            // the match body (e.g. $or, a nested $elemMatch) is a non-goal, not a column.
            if (isOp(conditionColumn)) {
                throw elemMatchOperatorError(relationName, conditionColumn);
            }

            // A dotted key would be split by processStatement into relation.column and lose
            // every segment after the first, silently comparing a different column.
            if (conditionColumn.includes('.')) {
                throw elemMatchColumnError(relationName, conditionColumn);
            }

            // Each operator applied to that column must be one the subquery can compile,
            // so a typo'd operator is rejected rather than silently dropped — which would
            // leave fewer conditions in place and widen the single-row match.
            if (_.isPlainObject(conditionValue)) {
                _.forIn(conditionValue, (operatorValue, op) => {
                    if (!isCompOp(op)) {
                        throw elemMatchOperatorError(relationName, op);
                    }
                });
            }
        });
    }

    /**
     * The converter receives sub query objects e.g. `qb.where('..', (qb) => {})`, which
     * we then pass around to our class methods. That's why we pass the parent `qb` object
     * around instead of remembering it as `this.qb`. There are multiple `qb` objects.
     */
    processJSON(qb, mongoJSON) {
        debug('(processJSON)');

        // DEBUG=mongo-knex:converter,mongo-knex:converter-extended
        if (debugExtended.enabled) {
            debugExtended(`(processJSON) ${stringify(mongoJSON)}`);
        }

        this.validateAggregateStatements(mongoJSON);
        this.validateElemMatchStatements(mongoJSON);

        // 'and' is the default behaviour
        this.buildQuery(qb, '$and', mongoJSON);
    }
}

module.exports = function convertor(qb, mongoJSON, config) {
    const mongoToKnex = new MongoToKnex({
        tableName: qb._single.table
    }, config);

    mongoToKnex.processJSON(qb, mongoJSON);

    return qb;
};
