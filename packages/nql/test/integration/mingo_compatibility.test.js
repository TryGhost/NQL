require('../utils');

const mingo = require('mingo');

describe('Mingo compatibility', function () {
    it('exposes the Query class', function () {
        mingo.Query.should.be.a.Function();
    });

    it('can evaluate basic queries', function () {
        const query = new mingo.Query({id: 1});

        query.test({id: 1}).should.eql(true);
        query.test({id: 2}).should.eql(false);
    });

    it('can handle logical operators', function () {
        const query = new mingo.Query({$and: [{status: 'draft'}, {featured: false}]});

        query.test({status: 'draft', featured: false}).should.eql(true);
        query.test({status: 'published', featured: false}).should.eql(false);
    });
});
