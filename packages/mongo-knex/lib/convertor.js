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
            const relation = this.config.relations[table];

            if (!relation) {
                throw new Error('Can\'t find relation in config object.');
            }

            return {
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
     * @TODO: This implementation serves currently only one use case:
     *
     * - OR conjunctions for many-to-many relations
     */
    buildRelationQuery(qb, relation) {
        debug(`(buildRelationQuery)`);

        if (debugExtended.enabled) {
            debugExtended(`(buildRelationQuery) ${JSON.stringify(relation)}`);
        }

        if (relation.config.type === 'manyToMany') {
            if (isCompOp(relation.operator)) {
                const comp = compOps[relation.operator] || '=';

                // CASE: post.id IN (SELECT ...)
                qb.where(`${this.tableName}.id`, 'IN', function () {
                    return this
                        .select(`${relation.config.join_table}.${relation.config.join_from}`)
                        .from(`${relation.config.join_table}`)
                        .innerJoin(`${relation.config.tableName}`, `${relation.config.tableName}.id`, '=', `${relation.config.join_table}.${relation.config.join_to}`)
                        .where(`${relation.config.tableName}.${relation.column}`, comp, relation.value);
                });
            } else {
                debug('unknown operator');
            }

            return;
        }

        debug('not implemented');
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
    buildComparison(qb, mode, statement, op, value) {
        const comp = compOps[op] || '=';
        const whereType = this.processWhereType(mode, op, value);
        const processedStatement = this.processStatement(statement, op, value);

        debug(`(buildComparison) isRelation: ${processedStatement.isRelation}`);

        if (processedStatement.isRelation) {
            return this.buildRelationQuery(qb, processedStatement);
        }

        debug(`(buildComparison) whereType: ${whereType}, statement: ${statement}, op: ${op}, comp: ${comp}, value: ${value}`);
        qb[whereType](processedStatement.column, comp, processedStatement.value);
    }

    /**
     * {author: 'carl'}
     */
    buildWhereClause(qb, mode, statement, sub) {
        debug(`(buildWhereClause) mode: ${mode}, statement: ${statement}`);

        if (debugExtended.enabled) {
            debugExtended(`(buildWhereClause) ${JSON.stringify(sub)}`);
        }

        // CASE sub is an atomic value, we use "eq" as default operator
        if (!_.isObject(sub)) {
            return this.buildComparison(qb, mode, statement, '$eq', sub);
        }

        // CASE: sub is an object, contains statements and operators
        _.forIn(sub, (value, op) => {
            if (isCompOp(op)) {
                this.buildComparison(qb, mode, statement, op, value);
            } else {
                debug('unknown operator');
            }
        });
    }

    /**
     * {$and: [{author: 'carl'}, {status: 'draft'}]}}
     */
    buildWhereGroup(qb, parentMode, mode, sub) {
        const whereType = this.processWhereType(parentMode);

        debug(`(buildWhereGroup) mode: ${mode}, whereType: ${whereType}`);

        if (debugExtended.enabled) {
            debugExtended(`(buildWhereGroup) ${JSON.stringify(sub)}`);
        }

        qb[whereType]((_qb) => {
            if (_.isArray(sub)) {
                sub.forEach(statement => this.buildQuery(_qb, mode, statement));
            } else if (_.isObject(sub)) {
                this.buildQuery(_qb, mode, sub);
            }
        });
    }

    buildQuery(qb, mode, sub) {
        debug(`(buildQuery) mode: ${mode}`);

        if (debugExtended.enabled) {
            debugExtended(`(buildQuery) ${JSON.stringify(sub)}`);
        }

        _.forIn(sub, (value, key) => {
            debug(`(buildQuery) key: ${key}`);

            if (isLogicOp(key)) {
                this.buildWhereGroup(qb, mode, key, value);
            } else {
                this.buildWhereClause(qb, mode, key, value);
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

        // And is the default behaviour
        this.buildQuery(qb, 'and', mongoJSON);
    }
}

module.exports = function convertor(qb, mongoJSON, config) {
    const mongoToKnex = new MongoToKnex({
        tableName: qb._single.table
    }, config);

    mongoToKnex.processJSON(qb, mongoJSON);

    return qb;
};
