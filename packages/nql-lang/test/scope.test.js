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

    describe('with preserveRelativeDates flag set', function () {
        afterEach(function () {
            scope.preserveRelativeDates = false;
        });

        it('returns a tagged value instead of an absolute date', function () {
            scope.preserveRelativeDates = true;

            scope.relDateToAbsolute('sub', '7', 'd').should.eql({
                $relativeDate: {op: 'sub', amount: 7, unit: 'days'}
            });
        });

        it('coerces the amount to a number and spells out the unit for every interval', function () {
            scope.preserveRelativeDates = true;

            const cases = [
                ['d', 'days'],
                ['w', 'weeks'],
                ['M', 'months'],
                ['y', 'years'],
                ['h', 'hours'],
                ['m', 'minutes'],
                ['s', 'seconds']
            ];

            cases.forEach(function ([short, long]) {
                scope.relDateToAbsolute('add', '3', short).should.eql({
                    $relativeDate: {op: 'add', amount: 3, unit: long}
                });
            });
        });
    });
});
