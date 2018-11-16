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
    $nin: 'not in'
};

const isOp = key => key.charAt(0) === '$';
const isLogicOp = key => isOp(key) && _.includes(logicOps, key);
const isCompOp = key => isOp(key) && _.includes(_.keys(compOps), key);

class MongoToKnex {
    constructor(options = {}, config = {}) {
        this.tableName = options.tableName;
        this.config = {};

        // @TODO: https://github.com/NexesJS/mongo-knex/issues/4
        Object.assign(this.config, {relations: {}, aliases: {}}, config);
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
        const columnParts = column.split('.');

        // CASE: `posts.status` -> where "posts" is the parent table
        if (columnParts[0] === this.tableName) {
            return {
                column: column,
                value: value,
                isRelation: false
            };
        }

        // CASE: relation?
        if (columnParts.length > 1) {
            debug(columnParts);

            const table = columnParts[0];
            let relation = this.config.relations[table];

            if (!relation) {
                // CASE: you want to filter by a column on the join table
                relation = _.find(this.config.relations, (relation) => {
                    return relation.join_table === table;
                });

                if (!relation) {
                    throw new Error('Can\'t find relation in config object.');
                }

                return {
                    join_table: relation.join_table,
                    table: relation.tableName,
                    column: columnParts[1],
                    operator: op,
                    value: value,
                    config: relation,
                    isRelation: true
                };
            }

            return {
                table: columnParts[0],
                column: columnParts[1],
                operator: op,
                value: value,
                config: relation,
                isRelation: true
            };
        }

        // CASE: fallback, `status=draft` -> `posts.status`=draft
        return {
            column: this.tableName + '.' + column,
            value: value,
            isRelation: false
        };
    }

    /**
     * Build queries for relations.
     */
    buildRelationQuery(qb, relations) {
        debug(`(buildRelationQuery)`);

        if (debugExtended.enabled) {
            debugExtended(`(buildRelationQuery) ${JSON.stringify(relations)}`);
        }

        const groupedRelations = {};

        _.each(relations, (relation) => {
            if (!groupedRelations[relation.table]) {
                groupedRelations[relation.table] = [];
            }

            if (groupedRelations[relation.table].length) {
                const columnExists = _.find(groupedRelations[relation.table], (statement) => {
                    // CASE: we should not use the same sub query if the column name is the same (two sub queries)
                    if (statement.column === relation.column) {
                        return true;
                    }
                });

                if (columnExists) {
                    const newKey = `${relation.table}_${Math.floor(Math.random() * 100)}`;
                    if (!groupedRelations[newKey]) {
                        groupedRelations[newKey] = [];
                    }

                    groupedRelations[newKey].push(relation);
                    return;
                }
            }

            groupedRelations[relation.table].push(relation);
        });

        if (debugExtended.enabled) {
            debugExtended(`(buildRelationQuery) grouped: ${JSON.stringify(groupedRelations)}`);
        }

        // CASE: {tags: [where clause, where clause], authors: [where clause, where clause]}
        _.each(Object.keys(groupedRelations), (key) => {
            debug(`(buildRelationQuery) build relation for ${key}`);

            const statements = groupedRelations[key];

            // CASE: any statement for the same relation should contain the same config
            const reference = statements[0];

            if (reference.config.type === 'manyToMany') {
                if (isCompOp(reference.operator)) {
                    const comp = reference.operator === '$ne' || reference.operator === '$nin' ? 'NOT IN' : 'IN';

                    // CASE: WHERE post.id IN (SELECT ...)
                    qb[reference.whereType](`${this.tableName}.id`, comp, function () {
                        const innerQB = this
                            .select(`${reference.config.join_table}.${reference.config.join_from}`)
                            .from(`${reference.config.join_table}`)
                            .innerJoin(`${reference.config.tableName}`, `${reference.config.tableName}.id`, '=', `${reference.config.join_table}.${reference.config.join_to}`);

                        _.each(statements, (value, key) => {
                            debug(`(buildRelationQuery) build relation where statements for ${key}`);
                            innerQB[value.whereType](`${value.join_table || value.table}.${value.column}`, 'IN', !_.isArray(value.value) ? [value.value] : value.value);
                        });

                        return innerQB;
                    });
                } else {
                    debug('unknown operator');
                }
            }
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
        const whereType = this.processWhereType(mode, op, value);
        const processedStatement = this.processStatement(statement, op, value);

        debug(`(buildComparison) mode: ${mode}, op: ${op}, isRelation: ${processedStatement.isRelation}, group: ${group}`);

        if (processedStatement.isRelation) {
            // CASE: if the statement is not part of a group, execute the query instantly
            if (!group) {
                processedStatement.whereType = whereType;
                this.buildRelationQuery(qb, [processedStatement]);
                return;
            }

            // CASE: if the statement is part of a group, collect the relation statements to be able to group them later
            if (!qb.hasOwnProperty('relations')) {
                qb.relations = [];
            }

            processedStatement.whereType = whereType;
            qb.relations.push(processedStatement);
            return;
        }

        debug(`(buildComparison) whereType: ${whereType}, statement: ${statement}, op: ${op}, comp: ${comp}, value: ${value}`);
        qb[whereType](processedStatement.column, comp, processedStatement.value);
    }

    /**
     * {author: 'carl'}
     */
    buildWhereClause(qb, mode, statement, sub, group) {
        debug(`(buildWhereClause) mode: ${mode}, statement: ${statement}`);

        if (debugExtended.enabled) {
            debugExtended(`(buildWhereClause) ${JSON.stringify(sub)}`);
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
            debugExtended(`(buildWhereGroup) ${JSON.stringify(sub)}`);
        }

        qb[whereType]((_qb) => {
            if (_.isArray(sub)) {
                sub.forEach(statement => this.buildQuery(_qb, mode, statement, true));
            } else if (_.isObject(sub)) {
                this.buildQuery(_qb, mode, sub, true);
            }

            // CASE: now execute all relation statements of this group
            if (_qb.hasOwnProperty('relations')) {
                this.buildRelationQuery(_qb, _qb.relations);
                delete _qb.relations;
            }
        });
    }

    buildQuery(qb, mode, sub, group) {
        debug(`(buildQuery) mode: ${mode}`);

        if (debugExtended.enabled) {
            debugExtended(`(buildQuery) ${JSON.stringify(sub)}`);
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
            debugExtended(`(processJSON) ${JSON.stringify(mongoJSON)}`);
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
