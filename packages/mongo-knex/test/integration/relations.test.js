const utils = require('../utils');
const knex = utils.db.client;

const convertor = require('../../lib/convertor');

/* eslint-disable no-console*/

const makeQuery = query => convertor(knex('posts'), query, {
    relations: {
        tags: {
            type: 'manyToMany',
            join_table: 'posts_tags',
            join_from: 'post_id',
            join_to: 'tag_id'
        },
        authors: {
            type: 'oneToMany',
            join_from: 'author_id'
        }
    }
});

// Integration tests build a test database and
// check that we get the exact data we expect from each query
describe.skip('Relations', function () {
    before(utils.db.setup(() => {
        // Do things afterwards in a callback
    }));

    after(utils.db.teardown());

    describe('One-to-Many', function () {
        // Use a named file
        beforeEach(utils.db.init('test-fixture', () => {
            // could do stuff after
        }));

        afterEach(utils.db.reset());

        it('can match array in (single value)', function (done) {
            const queryJSON = {'authors.slug': {$in: ['sam']}};

            // Use the queryJSON to build a query
            const query = makeQuery(queryJSON);

            // Check any intermediate values
            console.log(query.toQuery());

            // Perform the query against the DB
            query.select()
                .then((result) => {
                    console.log(result);

                    result.should.be.an.Array().with.lengthOf(2);

                    // Check we get the right data
                    // result.should.do.something;

                    done();
                })
                .catch(done);
        });

        it('can match array in (multiple values)', function (done) {
            const queryJSON = {'authors.name': {$in: ['Sam Smith', 'Pat Taylor']}};

            // Use the queryJSON to build a query
            const query = makeQuery(queryJSON);

            // Check any intermediate values
            console.log('query', query.toQuery());

            // Perform the query against the DB
            query.select()
                .then((result) => {
                    console.log(result);

                    result.should.be.an.Array().with.lengthOf(5);

                    // Check we get the right data
                    // result.should.do.something;

                    done();
                })
                .catch(done);
        });
    });

    describe('Many-to-Many: Simple Cases', function () {
        // Use the default file named after the describe block, would be many-to-many-simple-cases
        beforeEach(utils.db.init());

        afterEach(utils.db.reset());

        it('can match array in (single value)', function (done) {
            const queryJSON = {'tags.slug': {$in: ['animal']}};

            // Use the queryJSON to build a query
            const query = makeQuery(queryJSON);

            // Check any intermediate values
            console.log(query.toQuery());

            // Perform the query against the DB
            query.select()
                .then((result) => {
                    console.log(result);

                    result.should.be.an.Array().with.lengthOf(3);

                    // Check we get the right data
                    // result.should.do.something;

                    done();
                })
                .catch(done);
        });

        it('can match array in (multiple values)', function (done) {
            const queryJSON = {'tags.id': {$in: [2, 3]}};

            // Use the queryJSON to build a query
            const query = makeQuery(queryJSON);

            // Check any intermediate values
            console.log('query', query.toQuery());

            // Perform the query against the DB
            query.select()
                .then((result) => {
                    console.log(result);

                    result.should.be.an.Array().with.lengthOf(4);

                    // Check we get the right data
                    // result.should.do.something;

                    done();
                })
                .catch(done);
        });

        it('can match array in (multiple values with x, y and xy)', function (done) {
            const queryJSON = {'tags.id': {$in: [1, 2]}};

            // Use the queryJSON to build a query
            const query = makeQuery(queryJSON);

            // Check any intermediate values
            console.log('query', query.toQuery());

            // Perform the query against the DB
            query.select()
                .then((result) => {
                    console.log(result);

                    result.should.be.an.Array().with.lengthOf(5);

                    // Check we get the right data
                    // result.should.do.something;

                    done();
                })
                .catch(done);
        });
    });
});
