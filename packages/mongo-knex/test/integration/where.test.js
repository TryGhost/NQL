const utils = require('../utils');
const knex = utils.db.client;
const convertor = require('../../lib/convertor');

describe('Where', function () {
    before(utils.db.teardown());
    before(utils.db.setup());
    after(utils.db.teardown());

    it('filter by boolean', function () {
        const query = convertor(knex('posts'), {featured: true});
        query.toQuery().should.eql('select * from `posts` where `posts`.`featured` = true');

        return query
            .then((results) => {
                results.length.should.eql(5);
            });
    });
});
