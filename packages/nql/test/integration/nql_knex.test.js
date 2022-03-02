const utils = require('../utils');
const nql = require('../../lib/nql');

const knex = utils.db.client;

/**
 * The purpose of this file is to prove that NQL
 * is not just transformed to mongo queries correctly
 * but that this can be used in real world settings to query SQL databases
 */

describe('Integration with Knex', function () {
    before(utils.db.setup());
    after(utils.db.teardown());

    it('should match based on simple id', function () {
        const query = nql('featured:true');

        return query
            .querySQL(knex('posts'))
            .select()
            .then((result) => {
                result.should.be.an.Array().with.lengthOf(4);
                result[0].featured.should.equal(1);
            });
    });

    it('can match based on dates', function () {
        const query = nql('created_at:>=\'2022-03-02 11:06:49\'');

        return query
            .querySQL(knex('posts'))
            .select()
            .then((result) => {
                result.should.be.an.Array().with.lengthOf(2);
                result[0].title.should.eql('Be Our Guest');
                result[1].title.should.eql('He\'s a Tramp');
            });
    });

    it('can match based on dates ISO', function () {
        const query = nql('created_at:>=2022-03-02T11:06:49.000Z');

        return query
            .querySQL(knex('posts'))
            .select()
            .then((result) => {
                result.should.be.an.Array().with.lengthOf(2);
                result[0].title.should.eql('Be Our Guest');
                result[1].title.should.eql('He\'s a Tramp');
            });
    });

    it('can match based on dates with 2 different formats', function () {
        const query = nql('updated_at:<=2020-01-18T12:05:08.000Z');

        return query
            .querySQL(knex('posts'))
            .select()
            .then((result) => {
                result.should.be.an.Array().with.lengthOf(2);
                result[0].title.should.eql('A Whole New World');
                result[1].title.should.eql('The Bare Necessities');
            });
    });

    it('can match based on relative dates', function () {
        // This test relies on the fact that knex inserts an updated_at of now for all fixtures that are blank
        // Only 2 tests have explicit updated_at dates, this allows us to test 2 different formats
        const query = nql('updated_at:>now-1d');

        return query
            .querySQL(knex('posts'))
            .select()
            .then((result) => {
                result.should.be.an.Array().with.lengthOf(4);
                result[0].title.should.eql('When She Loved Me');
                result[1].title.should.eql('Circle of Life');
                result[2].title.should.eql('Be Our Guest');
                result[3].title.should.eql('He\'s a Tramp');
            });
    });
});
