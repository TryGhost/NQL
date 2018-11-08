const _ = require('lodash');
const debug = require('debug')('test');
const client = require('./client')();
const schema = require('./schema');

// export our instance of client & schema
module.exports.client = client;
module.exports.schema = schema;

/**
 * Utility function
 * Manipulate incoming fixture JSON format into Array:
 *
 * [
 *    {table: 'tableName', entry: {rowData},
 *    {table: 'tableName', entry: {rowData},
 *    ...
 * ]
 *
 * @param {Object} fixtureJson
 * @returns {Array}
 */
const flatten = (fixtureJson) => {
    const ops = [];
    _.each(fixtureJson, (entries, table) => {
        _.each(entries, (entry) => {
            ops.push({table, entry});
        });
    });

    return ops;
};

/**
 * Setup the DB ready for the test suite
 *
 * look for a base fixture file to import
 */
module.exports.setup = function setup(name, cb) {
    cb = _.isFunction(name) ? name : cb || _.noop;

    return function innerSetup() {
        this.testSuiteName = _.isString(name) ? name : _.kebabCase(_.deburr(this.test.parent.title));
        debug('Running setup for', this.testSuiteName);

        return schema.down(client)
            .then(() => schema.up(client))
            .then(() => {
                try {
                    debug('Loading base fixtures for', this.testSuiteName);
                    const base = require('./fixtures/base');
                    return Promise
                        .each(flatten(base), op => client(op.table).insert(op.entry));
                } catch (e) {
                    debug('Not loading any base fixtures for', this.testSuiteName);
                }
            })
            .then(cb);
    };
};

/**
 * Teardown the DB ready for the next suite, or the end of the tests
 *
 * Can be skipped
 */
module.exports.teardown = function teardown(cb) {
    cb = cb || _.noop;

    return function innerTeardown() {
        if (_.includes(process.argv, '--skip-teardown')) {
            debug('Skipping teardown for', this.testSuiteName);
            return client.destroy(cb);
        }

        debug('Running teardown for', this.testSuiteName);
        return schema
            .down(client)
            .then(() => client.destroy(cb));
    };
};

/**
 * Load fixtures, prior to a group of tests
 * Uses the name of the describe block
 * e.g. Many-to-many: Simple Cases -> many-to-many-simple-cases.json
 */
module.exports.init = function init(name, cb) {
    cb = _.isFunction(name) ? name : cb || _.noop;

    return function innerInit() {
        // Before each test, we load data specific to this suite of tests
        this.testGroupName = _.isString(name) ? name : _.kebabCase(_.deburr(this.currentTest.parent.title));

        try {
            let fixturesJSON = require(`./fixtures/${this.testGroupName}.json`);
            this.fixtures = flatten(fixturesJSON);
            debug('Loading fixtures for', this.testGroupName);
            return Promise
                .each(this.fixtures, op => client(op.table).insert(op.entry))
                .then(cb);
        } catch (e) {
            // No fixtures for this test group
            debug('Not loading any fixtures for', this.testGroupName);
            return cb();
        }
    };
};

/**
 * Unloads fixtures after a test group
 * WARNING: naively truncates all tables that were involved in the fixture file
 */
module.exports.reset = function reset(cb) {
    cb = cb || _.noop;

    return function innerReset() {
        // After each test, we unload any data specific to this suite of tests
        if (this.fixtures) {
            debug('Unloading fixtures for', this.testGroupName);
            return Promise
                .each(this.fixtures, op => client(op.table).truncate())
                .then(cb);
        } else {
            // No fixtures for this test group
            debug('Not unloading any fixtures for', this.testGroupName);
            return cb();
        }
    };
};
