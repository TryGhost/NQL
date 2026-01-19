require('./utils');

const scope = require('../lib/scope');

describe('Scope date helpers', function () {
    it('formats dates for SQL in UTC', function () {
        const result = scope.relDateToAbsolute('sub', 1, 'd');

        result.should.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    it('supports all interval units', function () {
        const intervals = ['d', 'w', 'M', 'y', 'h', 'm', 's'];

        intervals.forEach(function (interval) {
            const result = scope.relDateToAbsolute('add', 2, interval);

            result.should.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
        });
    });
});
