require('../utils');

const nql = require('../../lib/nql');
const simpleJSON = require('./mingo/simple');
const advancedJSON = require('./mingo/advanced');

/**
 * The purpose of this file is to prove that NQL
 * is not just transformed to mongo queries correctly
 * but that this can be used in real world settings to match JSON
 */
const makeQuery = (nqlString, options) => {
    return nql(nqlString, options);
};

describe('Integration with Mingo', function () {
    describe('Comparison Query Operators', function () {
        it('$eq', function () {
            const query = makeQuery('id:2');

            query.queryJSON(simpleJSON.posts[0]).should.eql(false);
            query.queryJSON(simpleJSON.posts[1]).should.eql(true);
            query.queryJSON(simpleJSON.posts[2]).should.eql(false);
        });

        it('NOT $eq', function () {
            const query = makeQuery('id:-2');

            query.queryJSON(simpleJSON.posts[0]).should.eql(true);
            query.queryJSON(simpleJSON.posts[1]).should.eql(false);
            query.queryJSON(simpleJSON.posts[2]).should.eql(true);
        });

        it('$gt', function () {
            const query = makeQuery('id:>2');

            query.queryJSON(simpleJSON.posts[0]).should.eql(false);
            query.queryJSON(simpleJSON.posts[1]).should.eql(false);
            query.queryJSON(simpleJSON.posts[2]).should.eql(true);
        });

        it('$lt', function () {
            const query = makeQuery('id:<2');

            query.queryJSON(simpleJSON.posts[0]).should.eql(true);
            query.queryJSON(simpleJSON.posts[1]).should.eql(false);
            query.queryJSON(simpleJSON.posts[2]).should.eql(false);
        });

        it('$gte', function () {
            const query = makeQuery('id:>=2');

            query.queryJSON(simpleJSON.posts[0]).should.eql(false);
            query.queryJSON(simpleJSON.posts[1]).should.eql(true);
            query.queryJSON(simpleJSON.posts[2]).should.eql(true);
        });

        it('$lte', function () {
            const query = makeQuery('id:<=2');

            query.queryJSON(simpleJSON.posts[0]).should.eql(true);
            query.queryJSON(simpleJSON.posts[1]).should.eql(true);
            query.queryJSON(simpleJSON.posts[2]).should.eql(false);
        });

        it('$eq IN', function () {
            const query = makeQuery('id:[1,3]');

            query.queryJSON(simpleJSON.posts[0]).should.eql(true);
            query.queryJSON(simpleJSON.posts[1]).should.eql(false);
            query.queryJSON(simpleJSON.posts[2]).should.eql(true);
        });

        it('$eq NOT IN', function () {
            const query = makeQuery('id:-[2]');

            query.queryJSON(simpleJSON.posts[0]).should.eql(true);
            query.queryJSON(simpleJSON.posts[1]).should.eql(false);
            query.queryJSON(simpleJSON.posts[2]).should.eql(true);
        });

        it('$eq IN (array)', function () {
            const query = makeQuery('tags:[video, audio]');

            query.queryJSON(simpleJSON.posts[0]).should.eql(false);
            query.queryJSON(simpleJSON.posts[1]).should.eql(true);
            query.queryJSON(simpleJSON.posts[2]).should.eql(true);
            query.queryJSON(simpleJSON.posts[3]).should.eql(true);
            query.queryJSON(simpleJSON.posts[4]).should.eql(false);
        });

        it('$eq NOT IN (array)', function () {
            const query = makeQuery('tags:-[video]');

            query.queryJSON(simpleJSON.posts[0]).should.eql(true);
            query.queryJSON(simpleJSON.posts[1]).should.eql(false);
            query.queryJSON(simpleJSON.posts[2]).should.eql(false);
            query.queryJSON(simpleJSON.posts[3]).should.eql(true);
            query.queryJSON(simpleJSON.posts[4]).should.eql(true);
        });

        it('$regex contains', function () {
            const query = nql(`title:~'th'`);

            query.queryJSON(simpleJSON.posts[0]).should.eql(false);
            query.queryJSON(simpleJSON.posts[1]).should.eql(false);
            query.queryJSON(simpleJSON.posts[2]).should.eql(false);
            query.queryJSON(simpleJSON.posts[3]).should.eql(true);
            query.queryJSON(simpleJSON.posts[4]).should.eql(false);
            query.queryJSON(simpleJSON.posts[5]).should.eql(true);
        });

        it('$not contains', function () {
            const query = nql(`title:-~'th'`);

            query.queryJSON(simpleJSON.posts[0]).should.eql(true);
            query.queryJSON(simpleJSON.posts[1]).should.eql(true);
            query.queryJSON(simpleJSON.posts[2]).should.eql(true);
            query.queryJSON(simpleJSON.posts[3]).should.eql(false);
            query.queryJSON(simpleJSON.posts[4]).should.eql(true);
            query.queryJSON(simpleJSON.posts[5]).should.eql(false);
        });

        it('$regex startswith', function () {
            const query = nql(`title:~^'Th'`);

            query.queryJSON(simpleJSON.posts[0]).should.eql(false);
            query.queryJSON(simpleJSON.posts[1]).should.eql(false);
            query.queryJSON(simpleJSON.posts[2]).should.eql(false);
            query.queryJSON(simpleJSON.posts[3]).should.eql(true);
            query.queryJSON(simpleJSON.posts[4]).should.eql(false);
            query.queryJSON(simpleJSON.posts[5]).should.eql(false);
        });

        it('$not startswith', function () {
            const query = nql(`title:-~^'Th'`);

            query.queryJSON(simpleJSON.posts[0]).should.eql(true);
            query.queryJSON(simpleJSON.posts[1]).should.eql(true);
            query.queryJSON(simpleJSON.posts[2]).should.eql(true);
            query.queryJSON(simpleJSON.posts[3]).should.eql(false);
            query.queryJSON(simpleJSON.posts[4]).should.eql(true);
            query.queryJSON(simpleJSON.posts[5]).should.eql(true);
        });

        it('$regex endswith', function () {
            const query = nql(`title:~$'st'`);

            query.queryJSON(simpleJSON.posts[0]).should.eql(true);
            query.queryJSON(simpleJSON.posts[1]).should.eql(true);
            query.queryJSON(simpleJSON.posts[2]).should.eql(true);
            query.queryJSON(simpleJSON.posts[3]).should.eql(false);
            query.queryJSON(simpleJSON.posts[4]).should.eql(false);
            query.queryJSON(simpleJSON.posts[5]).should.eql(false);
        });

        it('$not endswith', function () {
            const query = nql(`title:-~$'st'`);

            query.queryJSON(simpleJSON.posts[0]).should.eql(false);
            query.queryJSON(simpleJSON.posts[1]).should.eql(false);
            query.queryJSON(simpleJSON.posts[2]).should.eql(false);
            query.queryJSON(simpleJSON.posts[3]).should.eql(true);
            query.queryJSON(simpleJSON.posts[4]).should.eql(true);
            query.queryJSON(simpleJSON.posts[5]).should.eql(true);
        });
    });

    describe('Logical Query Operators', function () {
        it('$and (different properties)', function () {
            const query = makeQuery('featured:false+status:published');

            query.queryJSON(simpleJSON.posts[0]).should.eql(true);
            query.queryJSON(simpleJSON.posts[1]).should.eql(false);
            query.queryJSON(simpleJSON.posts[2]).should.eql(false);
        });

        it('$and (same properties)', function () {
            const query = makeQuery('featured:false+featured:true');

            query.queryJSON(simpleJSON.posts[0]).should.eql(false);
            query.queryJSON(simpleJSON.posts[1]).should.eql(false);
            query.queryJSON(simpleJSON.posts[2]).should.eql(false);
        });

        it('$and nested', function () {
            const query = makeQuery('tags.slug:video+tags.slug:photo');

            query.queryJSON(advancedJSON.posts[0]).should.eql(false);
            query.queryJSON(advancedJSON.posts[1]).should.eql(false);
            query.queryJSON(advancedJSON.posts[2]).should.eql(true);
            query.queryJSON(advancedJSON.posts[3]).should.eql(false);
            query.queryJSON(advancedJSON.posts[4]).should.eql(false);
        });

        it('$and nested not', function () {
            const query = makeQuery('tags.slug:video+tags.slug:-photo');

            query.queryJSON(advancedJSON.posts[0]).should.eql(false);
            query.queryJSON(advancedJSON.posts[1]).should.eql(true);
            query.queryJSON(advancedJSON.posts[2]).should.eql(false);
            query.queryJSON(advancedJSON.posts[3]).should.eql(false);
            query.queryJSON(advancedJSON.posts[4]).should.eql(false);
        });

        it('$or (different properties)', function () {
            const query = makeQuery('featured:false,status:published');

            query.queryJSON(simpleJSON.posts[0]).should.eql(true);
            query.queryJSON(simpleJSON.posts[1]).should.eql(true);
            query.queryJSON(simpleJSON.posts[2]).should.eql(true);
        });

        it('$or (same properties)', function () {
            const query = makeQuery('featured:true,featured:false');

            query.queryJSON(simpleJSON.posts[0]).should.eql(true);
            query.queryJSON(simpleJSON.posts[1]).should.eql(true);
            query.queryJSON(simpleJSON.posts[2]).should.eql(true);
        });

        it('$or nested', function () {
            const query = makeQuery('tags.slug:video,tags.slug:photo');

            query.queryJSON(advancedJSON.posts[0]).should.eql(true);
            query.queryJSON(advancedJSON.posts[1]).should.eql(true);
            query.queryJSON(advancedJSON.posts[2]).should.eql(true);
            query.queryJSON(advancedJSON.posts[3]).should.eql(false);
            query.queryJSON(advancedJSON.posts[4]).should.eql(false);
        });

        it('$or nested not', function () {
            const query = makeQuery('tags.slug:video,tags.slug:-photo');

            query.queryJSON(advancedJSON.posts[0]).should.eql(false);
            query.queryJSON(advancedJSON.posts[1]).should.eql(true);
            query.queryJSON(advancedJSON.posts[2]).should.eql(true);
            query.queryJSON(advancedJSON.posts[3]).should.eql(true);
            query.queryJSON(advancedJSON.posts[4]).should.eql(true);
        });
    });

    describe('Logical Groups', function () {
        describe('$or', function () {
            it('ungrouped version', function () {
                const query = makeQuery('author:-joe,tags:[photo],image:-null,featured:true');

                query.queryJSON(simpleJSON.posts[0]).should.eql(true); // tag photo
                query.queryJSON(simpleJSON.posts[1]).should.eql(true); // image not null
                query.queryJSON(simpleJSON.posts[2]).should.eql(true); // featured true
                query.queryJSON(simpleJSON.posts[3]).should.eql(true); // author not joe
                query.queryJSON(simpleJSON.posts[4]).should.eql(false);
                query.queryJSON(simpleJSON.posts[5]).should.eql(true);
            });

            it('RIGHT grouped version', function () {
                const query = makeQuery('author:-joe,(tags:[photo],image:-null,featured:true)');

                query.queryJSON(simpleJSON.posts[0]).should.eql(true);
                query.queryJSON(simpleJSON.posts[1]).should.eql(true);
                query.queryJSON(simpleJSON.posts[2]).should.eql(true);
                query.queryJSON(simpleJSON.posts[3]).should.eql(true);
                query.queryJSON(simpleJSON.posts[4]).should.eql(false);
                query.queryJSON(simpleJSON.posts[5]).should.eql(true);
            });

            it('LEFT grouped version', function () {
                const query = makeQuery('(tags:[photo],image:-null,featured:true),author:-joe');

                query.queryJSON(simpleJSON.posts[0]).should.eql(true);
                query.queryJSON(simpleJSON.posts[1]).should.eql(true);
                query.queryJSON(simpleJSON.posts[2]).should.eql(true);
                query.queryJSON(simpleJSON.posts[3]).should.eql(true);
                query.queryJSON(simpleJSON.posts[4]).should.eql(false);
                query.queryJSON(simpleJSON.posts[5]).should.eql(true);
            });
        });

        describe('$and', function () {
            it('ungrouped version', function () {
                const query = makeQuery('author:-joe+tags:[photo]+image:-null+featured:true');

                query.queryJSON(simpleJSON.posts[0]).should.eql(false);
                query.queryJSON(simpleJSON.posts[1]).should.eql(false);
                query.queryJSON(simpleJSON.posts[2]).should.eql(false);
                query.queryJSON(simpleJSON.posts[3]).should.eql(false);
                query.queryJSON(simpleJSON.posts[4]).should.eql(false);
                query.queryJSON(simpleJSON.posts[5]).should.eql(true);
            });

            it('RIGHT grouped version', function () {
                const query = makeQuery('author:-joe+(tags:[photo]+image:-null+featured:true)');

                query.queryJSON(simpleJSON.posts[0]).should.eql(false);
                query.queryJSON(simpleJSON.posts[1]).should.eql(false);
                query.queryJSON(simpleJSON.posts[2]).should.eql(false);
                query.queryJSON(simpleJSON.posts[3]).should.eql(false);
                query.queryJSON(simpleJSON.posts[4]).should.eql(false);
                query.queryJSON(simpleJSON.posts[5]).should.eql(true);
            });

            it('LEFT grouped version', function () {
                const query = makeQuery('(tags:[photo]+image:-null+featured:true)+author:-joe');

                query.queryJSON(simpleJSON.posts[0]).should.eql(false);
                query.queryJSON(simpleJSON.posts[1]).should.eql(false);
                query.queryJSON(simpleJSON.posts[2]).should.eql(false);
                query.queryJSON(simpleJSON.posts[3]).should.eql(false);
                query.queryJSON(simpleJSON.posts[4]).should.eql(false);
                query.queryJSON(simpleJSON.posts[5]).should.eql(true);
            });
        });

        describe('$or with $and group', function () {
            it('ungrouped version', function () {
                const query = makeQuery('author:-joe,tags:[photo]+image:-null+featured:true');

                query.queryJSON(simpleJSON.posts[0]).should.eql(false);
                query.queryJSON(simpleJSON.posts[1]).should.eql(false);
                query.queryJSON(simpleJSON.posts[2]).should.eql(true); // author not joe
                query.queryJSON(simpleJSON.posts[3]).should.eql(true); // author not joe
                query.queryJSON(simpleJSON.posts[4]).should.eql(false);
                query.queryJSON(simpleJSON.posts[5]).should.eql(true); // tag photo + image not null + featured
            });

            it('RIGHT grouped version', function () {
                const query = makeQuery('author:-joe,(tags:[photo]+image:-null+featured:true)');

                query.queryJSON(simpleJSON.posts[0]).should.eql(false);
                query.queryJSON(simpleJSON.posts[1]).should.eql(false);
                query.queryJSON(simpleJSON.posts[2]).should.eql(true);
                query.queryJSON(simpleJSON.posts[3]).should.eql(true);
                query.queryJSON(simpleJSON.posts[4]).should.eql(false);
                query.queryJSON(simpleJSON.posts[5]).should.eql(true); // tag photo + image not null + featured;
            });

            it('LEFT grouped version', function () {
                const query = makeQuery('(tags:[photo]+image:-null+featured:true),author:-joe');

                query.queryJSON(simpleJSON.posts[0]).should.eql(false);
                query.queryJSON(simpleJSON.posts[1]).should.eql(false);
                query.queryJSON(simpleJSON.posts[2]).should.eql(true);
                query.queryJSON(simpleJSON.posts[3]).should.eql(true);
                query.queryJSON(simpleJSON.posts[4]).should.eql(false);
                query.queryJSON(simpleJSON.posts[5]).should.eql(true); // tag photo + image not null + featured
            });
        });

        describe('$and with $or group', function () {
            it('ungrouped version', function () {
                const query = makeQuery('author:-joe+tags:[photo],image:-null,featured:true');

                query.queryJSON(simpleJSON.posts[0]).should.eql(false);
                query.queryJSON(simpleJSON.posts[1]).should.eql(true);
                query.queryJSON(simpleJSON.posts[2]).should.eql(true);
                query.queryJSON(simpleJSON.posts[3]).should.eql(true);
                query.queryJSON(simpleJSON.posts[4]).should.eql(false);
                query.queryJSON(simpleJSON.posts[5]).should.eql(true);
            });

            it('RIGHT grouped version', function () {
                const query = makeQuery('author:-joe+(tags:[photo],image:-null,featured:true)');

                query.queryJSON(simpleJSON.posts[0]).should.eql(false);
                query.queryJSON(simpleJSON.posts[1]).should.eql(false);
                query.queryJSON(simpleJSON.posts[2]).should.eql(true);
                query.queryJSON(simpleJSON.posts[3]).should.eql(true);
                query.queryJSON(simpleJSON.posts[4]).should.eql(false);
                query.queryJSON(simpleJSON.posts[5]).should.eql(true);
            });

            it('LEFT grouped version', function () {
                const query = makeQuery('(tags:[photo],image:-null,featured:true)+author:-joe');

                query.queryJSON(simpleJSON.posts[0]).should.eql(false);
                query.queryJSON(simpleJSON.posts[1]).should.eql(false);
                query.queryJSON(simpleJSON.posts[2]).should.eql(true);
                query.queryJSON(simpleJSON.posts[3]).should.eql(true);
                query.queryJSON(simpleJSON.posts[4]).should.eql(false);
                query.queryJSON(simpleJSON.posts[5]).should.eql(true);
            });
        });
    });

    describe('Expansions', function () {
        it('can handle empty expansions', function () {
            const query = makeQuery('tags:[photo]', {expansions: {}});

            query.queryJSON(advancedJSON.posts[0]).should.eql(false);
            query.queryJSON(advancedJSON.posts[1]).should.eql(false);
            query.queryJSON(advancedJSON.posts[2]).should.eql(false);
            query.queryJSON(advancedJSON.posts[3]).should.eql(false);
            query.queryJSON(advancedJSON.posts[4]).should.eql(false);
        });

        it('can expand a field alias', function () {
            const query = makeQuery('tags:[photo]', {expansions: [{key: 'tags', replacement: 'tags.slug'}]});

            query.queryJSON(advancedJSON.posts[0]).should.eql(true);
            query.queryJSON(advancedJSON.posts[1]).should.eql(false);
            query.queryJSON(advancedJSON.posts[2]).should.eql(true);
            query.queryJSON(advancedJSON.posts[3]).should.eql(false);
            query.queryJSON(advancedJSON.posts[4]).should.eql(false);
        });

        it('can expand multiple field aliases', function () {
            const query = makeQuery('tags:[photo]+authors:joanne', {expansions: [{key: 'tags', replacement: 'tags.slug'}, {key: 'authors', replacement: 'authors.slug'}]});

            query.queryJSON(advancedJSON.posts[0]).should.eql(false);
            query.queryJSON(advancedJSON.posts[1]).should.eql(false);
            query.queryJSON(advancedJSON.posts[2]).should.eql(true);
            query.queryJSON(advancedJSON.posts[3]).should.eql(false);
            query.queryJSON(advancedJSON.posts[4]).should.eql(false);
        });
    });

    describe.only('Dates', function () {
        // Dates are a nightmare because SQLite3 and MySQL work differently, and knex doesn't help here
        // The date format that goes into a database has to be YYYY-MM-DD HH:mm:ss, but what comes out is normalised to ISO YYYY-MM-DDTHH:mm:ss.000Z

        it('can query JSON by date', function () {
            const query = makeQuery('created_at:>=\'2022-03-02 10:14:23\'');

            query.queryJSON({created_at: '2022-03-02T10:14:23.000Z'}).should.eql(true);
            query.queryJSON({created_at: '2022-03-02 10:14:23'}).should.eql(true);
            query.queryJSON({created_at: '2022-03-02T10:14:24.000Z'}).should.eql(true);
            query.queryJSON({created_at: '2022-03-02 10:14:24'}).should.eql(true);
            // FAIL query.queryJSON({created_at: '2022-03-02T10:14:22.000Z'}).should.eql(false);
            query.queryJSON({created_at: '2022-03-02 10:14:22'}).should.eql(false);

            query.queryJSON({}).should.eql(false);
        });

        it('can query JSON by ISO date', function () {
            const query = makeQuery('created_at:>=\'2022-03-02T10:14:23.000Z\'');

            query.queryJSON({created_at: '2022-03-02T10:14:23.000Z'}).should.eql(true);
            // FAIL query.queryJSON({created_at: '2022-03-02 10:14:23'}).should.eql(true);
            query.queryJSON({created_at: '2022-03-02T10:14:24.000Z'}).should.eql(true);
            // FAIL query.queryJSON({created_at: '2022-03-02 10:14:24'}).should.eql(true);
            query.queryJSON({created_at: '2022-03-02T10:14:22.000Z'}).should.eql(false);
            query.queryJSON({created_at: '2022-03-02 10:14:22'}).should.eql(false);

            query.queryJSON({}).should.eql(false);
        });

        it('can query JSON by rel date', function () {
            const query = makeQuery('created_at:>=now-1d');

            console.log(new Date().toISOString());
            console.log(new Date());

            query.queryJSON({created_at: new Date().toISOString()}).should.eql(true);
            query.queryJSON({created_at: '2022-01-00T00:00:00.000Z'}).should.eql(false);
            query.queryJSON({created_at: '2022-01-00 00:00:00'}).should.eql(false);
        });
    });
});
