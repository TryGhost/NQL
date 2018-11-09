const _ = require('lodash');
const debug = require('debug')('mongo-knex:converter');

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
    constructor(qb) {
        this.qb = qb;
        this.tablename = qb._single.table;

        this.joins = [];
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

    processField(field, op) {
        const fieldParts = field.split('.');

        if (fieldParts[0] === this.tablename) {
            // If we have the right table already, return
            return field;
        } else if (fieldParts.length > 1) {
            // If we have a different table, that should be a join
            // Store the OP because an IN is different
            this.joins.push({table: fieldParts[0], op});

            return field;
        }

        return this.tablename + '.' + field;
    }

    buildComparison(qb, mode, field, op, value) {
        let comp = compOps[op] || '=';
        let whereType = this.processWhereType(mode, op, value);
        field = this.processField(field, op);

        debug(`(buildComparison) whereType: ${whereType}, field: ${field}, op: ${op}, comp: ${comp}, value: ${value}`);
        qb[whereType](field, comp, value);
    }

    buildWhereClause(qb, mode, field, sub) {
        debug(`(whereClause) mode: ${mode}, field: ${field}, sub: ${JSON.stringify(sub)}`);

        if (!_.isObject(sub)) {
            this.buildComparison(qb, mode, field, '$eq', sub);
        } else {
            _.forIn(sub, (value, op) => {
                if (isCompOp(op)) {
                    this.buildComparison(qb, mode, field, op, value);
                }
            });
        }
    }

    buildWhereGroup(qb, parentMode, mode, sub) {
        const whereType = this.processWhereType(parentMode);

        debug(`(whereGroup) mode: ${mode}, sub: ${JSON.stringify(sub)}`);

        qb[whereType]((_qb) => {
            if (_.isArray(sub)) {
                sub.forEach(statement => this.buildQuery(_qb, mode, statement));
            } else if (_.isObject(sub)) {
                this.buildQuery(_qb, mode, sub);
            }
        });
    }

    buildQuery(qb, mode, sub) {
        debug(`(buildQuery) mode: ${mode}, sub: ${JSON.stringify(sub)}`);

        _.forIn(sub, (value, key) => {
            if (isLogicOp(key)) {
                this.buildWhereGroup(qb, mode, key, value);
            } else {
                this.buildWhereClause(qb, mode, key, value);
            }
        });
    }

    processJSON(queryJSON) {
        // And is the default behaviour
        this.buildQuery(this.qb, 'and', queryJSON);
    }
}

module.exports = function convertor(qb, mongoJSON) {
    const mongoToKnex = new MongoToKnex(qb);

    mongoToKnex.processJSON(mongoJSON);

    return qb;
};
