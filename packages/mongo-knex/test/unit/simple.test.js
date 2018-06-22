require('../utils');
const knex = require('knex')({client: 'mysql'});
const convertor = require('../../lib/convertor');
/**
 * TODO: write way more mongo-query specific tests
 *
 * There will be a heap of integration tests between NQL -> SQL in the wrapper lib
 * I just haven't spent time on writing out a bunch of Mongo JSON Queries yet...
 * ...but I should... and this lib should have as much support for it as we can muster.
 */

const runQuery = query => convertor(knex('posts'), query).toQuery();

describe('Simple Expressions', function () {
    it('should match based on simple id', function () {
        runQuery({id: 3})
            .should.eql('select * from `posts` where `posts`.`id` = 3');
    });

    it('should match based on string', function () {
        runQuery({title: 'Second post'})
            .should.eql('select * from `posts` where `posts`.`title` = \'Second post\'');
    });
});
