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
// rejected up front or the two evaluations can disagree
const isNumericScalar = value => (_.isNumber(value) && Number.isFinite(value))
    || (_.isString(value) && value.trim() !== '' && Number.isFinite(Number(value)));
const isAggregateValue = value => (_.isArray(value) ? _.every(value, isNumericScalar) : isNumericScalar(value));

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

const processRegExp = ({source, ignoreCase}) => {
    // A regexp is transformed into a LIKE SQL query.
    // So we need to remove all the regexp escaped characters
    // We don't support any special regexp operators apart from startsWith and endsWith (or both) queries
    source = source.replace(/\\([.*+?^${}()|[\]\\/])/g, '$1');

    if (ignoreCase) {
        source = source.toLowerCase();
    }

    // Escape escape character itself
    source = source.replace(new RegExp(_.escapeRegExp(likeEscapeCharacter), 'g'), likeEscapeCharacter + likeEscapeCharacter);

    // Escape special LIKE characters (% and _)
    source = source.replace(/%/g, likeEscapeCharacter + '%');
    source = source.replace(/_/g, likeEscapeCharacter + '_');

    // For starts with and ends with in SQL we have to put the wildcard at the opposite end of the string to the regex symbol!
    if (source.startsWith('^')) {
        source = source.substring(1) + '%';
    } else if (source.endsWith('$')) {
        source = '%' + source.substring(0, source.length - 1);
    } else {
        source = '%' + source + '%';
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
     * a column, e.g. `tag_count.count:>1`. The dotted suffix (`count`) is purely
     * descriptive - what is computed is defined by the relation config:
     *  {[relation-name]}: {
     *      type: 'aggregate'
     *      aggregate: {fn: String (e.g. countDistinct), column: String (e.g. posts_tags.tag_id)}
     *      tableName: String (e.g. posts_tags) - table holding the related rows
     *      joinFrom: String (e.g. post_id) - column on tableName referencing the parent table's id
     *      joins: [{tableName, from, to}] (optional) - chain of joins needed to qualify rows
     *      wheres: {[column]: value} (optional) - fixed conditions a related row must meet to be counted
     *  }
     */
    constructor(options = {}, config = {}) {
        this.tableName = options.tableName;
        this.cte = config.cte;
        this.config = {};

        Object.assign(this.config, {relations: {}}, config);
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
             */
            let shouldCreateSubGroup = isNegationOp(statement.operator);
            if (!shouldCreateSubGroup && group[statement.table]) {
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
                    // otherwise we cannot combine groups with negated and regular equation operators
                    const negateGroup = _.every(statements.map(s => s.operator), (operator) => {
                        return isNegationOp(operator);
                    });

                    const comp = negateGroup
                        ? compOps.$nin
                        : compOps.$in;

                    const whereType = ['whereNull', 'whereNotNull'].includes(reference.whereType) ? 'andWhere' : (['orWhereNull', 'orWhereNotNull'].includes(reference.whereType) ? 'orWhere' : reference.whereType);

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

                            if (negateGroup) {
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

                            innerQB[statement.whereType](statementColumn, statementOp, statementValue);
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
                    // otherwise we cannot combine groups with negated and regular equation operators
                    const negateGroup = _.every(statements.map(s => s.operator), (operator) => {
                        return isNegationOp(operator);
                    });

                    const comp = negateGroup
                        ? compOps.$nin
                        : compOps.$in;
                    const tableName = this.tableName;

                    const where = reference.whereType === 'orWhere' ? 'orWhere' : 'where';
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

                            // NOTE: this negation is here to ensure records with no relation are
                            //       include in negation (e.g. `relation.columnName: {$ne: null})
                            if (negateGroup) {
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

                            innerQB[statement.whereType](statementColumn, statementOp, statementValue);
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
                if (_.every(statements, s => isAggregateCompOp(s.operator) && isAggregateValue(s.value))) {
                    this.buildAggregateRelationQuery(qb, statements, reference, mode, groupedRelations[key].joinFilterStatements);
                } else {
                    debug(`one of ${key} group statements contains an operator or value not supported for aggregate relations`);
                }
            }
        });
    }

    /**
     * Build a grouped subquery for an `aggregate` relation, e.g. for `tag_count.count > 1`:
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

        // CASE: WHERE resource.id (IN | NOT IN) (SELECT ... GROUP BY ... HAVING ...)
        qb[whereType](`${this.tableName}.id`, comp, function () {
            const innerQB = this
                .select(`${config.tableName}.${config.joinFrom}`)
                .from(config.tableName);

            // CASE: a single NULL in a NOT IN list makes the comparison UNKNOWN for every
            //       parent row, so an orphaned related row (NULL joinFrom) would silently
            //       empty the whole result set
            if (invertSubquery) {
                innerQB.whereNotNull(`${config.tableName}.${config.joinFrom}`);
            }

            // CASE: qualifying related rows can live across a chain of joined tables,
            //       each join's `from` column references the `to` column of the previous table
            let previousTable = config.tableName;
            _.each(config.joins, (join) => {
                innerQB.innerJoin(join.tableName, `${join.tableName}.${join.from}`, `${previousTable}.${join.to}`);
                previousTable = join.tableName;
            });

            // CASE: fixed conditions a related row must meet to be counted live in
            //       the relation config, they are not part of the filter input
            _.each(config.wheres, (value, column) => {
                innerQB.where(column, value);
            });

            // CASE: when applying AND conjunction, filters on a join table restrict
            //       which related rows are aggregated (same as the other relation types)
            _.each(joinFilterStatements, (joinFilter) => {
                innerQB.where(`${joinFilter.joinTable}.${joinFilter.column}`, compOps[joinFilter.operator], joinFilter.value);
            });

            innerQB.groupBy(`${config.tableName}.${config.joinFrom}`);

            _.each(statements, (statement, idx) => {
                debug(`(buildAggregateRelationQuery) build aggregate having statement for ${idx}`);

                const operator = invertSubquery ? complementOps[statement.operator] : statement.operator;
                // CASE: inverting the predicate also flips the conjunction between
                //       statements (De Morgan), hence the XOR with the mode
                const useOr = idx !== 0 && ((mode === '$or') !== invertSubquery);
                const havingType = useOr ? 'orHavingRaw' : 'havingRaw';

                if (isStatementGroupOp(compOps[operator])) {
                    const statementValue = _.castArray(statement.value);

                    // CASE: IN () is invalid SQL and an empty set can never match
                    if (statementValue.length === 0) {
                        innerQB[havingType]('1 = 0');
                        return;
                    }

                    const placeholders = statementValue.map(() => '?').join(', ');
                    innerQB[havingType](`${aggregateFunction} ${compOps[operator]} (${placeholders})`, [config.aggregate.column, ...statementValue]);
                } else {
                    innerQB[havingType](`${aggregateFunction} ${compOps[operator]} ?`, [config.aggregate.column, statement.value]);
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
            if (!Object.prototype.hasOwnProperty.call(qb, 'relations')) {
                qb.relations = [];
            }

            qb.relations.push(processedStatement);
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
        qb[whereType](column, comp, value);
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
        _.forIn(sub, (value, op) => {
            if (isCompOp(op)) {
                this.buildComparison(qb, mode, statement, op, value, group);
            } else {
                debug('unknown operator');
            }
        });
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
