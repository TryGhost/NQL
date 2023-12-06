require('../utils');

const nqlCore = require('../../core');
const sandbox = sinon.createSandbox();

describe('Core API', function () {
    afterEach(function () {
        sandbox.restore();
    });

    describe('querySQL', function () {
        it('is not implemented', function () {
            const query = nqlCore('id:3');

            try {
                query.querySQL();
                should.fail();
            } catch (err) {
                err.message.should.eql('querySQL is not implemented in the browser');
            }
        });
    });
});
