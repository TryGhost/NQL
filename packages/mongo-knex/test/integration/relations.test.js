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

    // NOTE: no need to support 1:1 relations just yet
    describe.skip('One-to-One: Extended Cases', function () {
        beforeEach(() => utils.db.init('suite1', 'one-to-one-extended-cases'));
        afterEach(() => utils.db.reset());

        // TODO: should be filled with cases from 'Many-to-Many: Extended Cases' suite
    });

    describe.skip('One-to-Many: Extended Cases', function () {
        beforeEach(() => utils.db.init('suite1', 'one-to-many-extended-cases'));
        afterEach(() => utils.db.reset());

        // TODO: should be filled with cases from 'Many-to-Many: Extended Cases' suite
    });

    describe.skip('Many-to-Many: Extended Cases', function () {
        before(() => utils.db.init('suite1', 'many-to-many-extended-cases'));
        after(() => utils.db.reset());

        describe('negation $ne and $nin', function () {
            it('can match $ne (single value)', function () {
                const queryJSON = {
                    'tags.slug': {
                        $ne: 'animal'
                    }
                };

                // Use the queryJSON to build a query
                const query = makeQuery(queryJSON);

                // Check any intermediate values
                console.log(query.toQuery());

                // Perform the query against the DB
                return query.select()
                    .then((result) => {
                        console.log(result);

                        // NOTE: make sure to count in posts with no tags
                        //       do not count in posts with multiple tags containing one of the excluded tags
                        result.should.be.an.Array().with.lengthOf(3);

                        // Check we get the right data
                        // result.should.do.something;
                    });
            });

            it('can match aliased $ne (single value)', function () {
                // NOTE: makeQuery needs additional configuration to be passed in for aliases
                const queryJSON = {
                    tag: {
                        $ne: 'animal'
                    }
                };

                // Use the queryJSON to build a query
                const query = makeQuery(queryJSON);

                // Check any intermediate values
                console.log(query.toQuery());

                // Perform the query against the DB
                return query.select()
                    .then((result) => {
                        console.log(result);

                        // NOTE: make sure to count in posts with no tags
                        //       do not count in posts with multiple tags containing one of the excluded tags
                        result.should.be.an.Array().with.lengthOf(3);

                        // Check we get the right data
                        // result.should.do.something;
                    });
            });

            it('can match array $nin (single value)', function () {
                const queryJSON = {
                    'tags.slug': {
                        $nin: ['animal']
                    }
                };

                // Use the queryJSON to build a query
                const query = makeQuery(queryJSON);

                // Check any intermediate values
                console.log(query.toQuery());

                // Perform the query against the DB
                return query.select()
                    .then((result) => {
                        console.log(result);

                        // NOTE: make sure to count in posts with no tags
                        //       do not count in posts with multiple tags containing one of the excluded tags
                        result.should.be.an.Array().with.lengthOf(3);

                        // Check we get the right data
                        // result.should.do.something;
                    });
            });

            it('can match array $nin (multiple values)', function () {
                const queryJSON = {
                    'tags.slug': {
                        $nin: ['animal', 'classic']
                    }
                };

                // Use the queryJSON to build a query
                const query = makeQuery(queryJSON);

                // Check any intermediate values
                console.log('query', query.toQuery());

                // Perform the query against the DB
                return query.select()
                    .then((result) => {
                        console.log(result);

                        // NOTE: make sure to count in posts with no tags
                        //       do not count in posts with multiple tags containing one of the excluded tags
                        result.should.be.an.Array().with.lengthOf(1);

                        // Check we get the right data
                        // result.should.do.something;
                    });
            });
        });

        describe('count', function () {
            it('can compare by count $gt', function () {
                const queryJSON = {
                    'authors.count': {$gt: 0}
                };

                // Use the queryJSON to build a query
                const query = makeQuery(queryJSON);

                // Check any intermediate values
                console.log(query.toQuery());

                // Perform the query against the DB
                return query.select()
                    .then((result) => {
                        console.log(result);

                        result.should.be.an.Array().with.lengthOf(3);

                        // Check we get the right data
                        // result.should.do.something;
                    });
            });

            it('can compare by count $lt', function () {
                const queryJSON = {
                    'authors.count': {$lt: 2}
                };

                // Use the queryJSON to build a query
                const query = makeQuery(queryJSON);

                // Check any intermediate values
                console.log(query.toQuery());

                // Perform the query against the DB
                return query.select()
                    .then((result) => {
                        console.log(result);

                        result.should.be.an.Array().with.lengthOf(3);

                        // Check we get the right data
                        // result.should.do.something;
                    });
            });
        });

        describe('conjunction $and', function () {
            it('can match multiple values of same attribute', function () {
                const queryJSON = {
                    $and: [
                        {'author.slug': 'pat'},
                        {'authors.slug': 'sam'}
                    ]
                };

                // Use the queryJSON to build a query
                const query = makeQuery(queryJSON);

                // Check any intermediate values
                console.log(query.toQuery());

                // Perform the query against the DB
                return query.select()
                    .then((result) => {
                        console.log(result);

                        result.should.be.an.Array().with.lengthOf(3);

                        // Check we get the right data
                        // result.should.do.something;
                    });
            });

            it('can match multiple values of different attributes', function () {
                const queryJSON = {
                    $and: [
                        {'authors.slug': 'pat'},
                        {'tags.slug': 'classic'}
                    ]
                };

                // Use the queryJSON to build a query
                const query = makeQuery(queryJSON);

                // Check any intermediate values
                console.log(query.toQuery());

                // Perform the query against the DB
                return query.select()
                    .then((result) => {
                        console.log(result);

                        result.should.be.an.Array().with.lengthOf(3);

                        // Check we get the right data
                        // result.should.do.something;
                    });
            });

            it('can match multiple values of same aliased attribute', function () {
                // NOTE: makeQuery needs additional configuration to be passed in for aliases
                const queryJSON = {
                    $and: [
                        {author: 'pat'},
                        {author: 'sam'}
                    ]
                };

                // Use the queryJSON to build a query
                const query = makeQuery(queryJSON);

                // Check any intermediate values
                console.log(query.toQuery());

                // Perform the query against the DB
                return query.select()
                    .then((result) => {
                        console.log(result);

                        result.should.be.an.Array().with.lengthOf(3);

                        // Check we get the right data
                        // result.should.do.something;
                    });
            });
        });

        describe('conjunction $or', function () {
            it('can match values of same attributes', function () {
                const queryJSON = {
                    $or: [
                        {'authors.slug': 'joe'},
                        {'authors.slug': 'pat'}
                    ]
                };

                // Use the queryJSON to build a query
                const query = makeQuery(queryJSON);

                // Check any intermediate values
                console.log(query.toQuery());

                // Perform the query against the DB
                return query.select()
                    .then((result) => {
                        console.log(result);

                        result.should.be.an.Array().with.lengthOf(3);

                        // Check we get the right data
                        // result.should.do.something;
                    });
            });

            it('can match values of different attributes', function () {
                const queryJSON = {
                    $or: [
                        {'authors.slug': 'joe'},
                        {'tags.slug': 'photo'}
                    ]
                };

                // Use the queryJSON to build a query
                const query = makeQuery(queryJSON);

                // Check any intermediate values
                console.log(query.toQuery());

                // Perform the query against the DB
                return query.select()
                    .then((result) => {
                        console.log(result);

                        result.should.be.an.Array().with.lengthOf(3);

                        // Check we get the right data
                        // result.should.do.something;
                    });
            });

            it('can match values of same aliased attributes', function () {
                // NOTE: makeQuery needs additional configuration to be passed in for aliases
                const queryJSON = {
                    $or: [
                        {author: 'joe'},
                        {author: 'pat'}
                    ]
                };

                // Use the queryJSON to build a query
                const query = makeQuery(queryJSON);

                // Check any intermediate values
                console.log(query.toQuery());

                // Perform the query against the DB
                return query.select()
                    .then((result) => {
                        console.log(result);

                        result.should.be.an.Array().with.lengthOf(3);

                        // Check we get the right data
                        // result.should.do.something;
                    });
            });
        });

        describe('combination of extended cases', function () {
            it('should be filled with a mix of all the above cases', function () {
            });

            it('can match values of different attributes combining with negation', function () {
                const queryJSON = {
                    $or: [
                        {'authors.slug': {$ne: 'joe'}},
                        {'tags.slug': {$in: ['photo']}}
                    ]
                };

                // Use the queryJSON to build a query
                const query = makeQuery(queryJSON);

                // Check any intermediate values
                console.log(query.toQuery());

                // Perform the query against the DB
                return query.select()
                    .then((result) => {
                        console.log(result);

                        result.should.be.an.Array().with.lengthOf(3);

                        // Check we get the right data
                        // result.should.do.something;
                    });
            });
        });
    });
});
