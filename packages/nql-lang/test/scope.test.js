require('./utils');

const sinon = require('sinon');
const scope = require('../lib/scope');

describe('Scope date helpers', function () {
    it('formats dates for SQL in UTC', function () {
        const result = scope.relDateToAbsolute('sub', 1, 'd');

        result.should.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    describe('date arithmetic', function () {
        let clock;

        const freezeAt = (iso) => {
            clock = sinon.useFakeTimers(new Date(iso).getTime());
        };

        afterEach(function () {
            if (clock) {
                clock.restore();
                clock = undefined;
            }
        });

        it('shifts by each unit', function () {
            freezeAt('2021-05-15T18:45:12Z');

            scope.relDateToAbsolute('add', 30, 's').should.eql('2021-05-15 18:45:42');
            scope.relDateToAbsolute('add', 20, 'm').should.eql('2021-05-15 19:05:12');
            scope.relDateToAbsolute('sub', 19, 'h').should.eql('2021-05-14 23:45:12');
            scope.relDateToAbsolute('add', 20, 'd').should.eql('2021-06-04 18:45:12');
            scope.relDateToAbsolute('sub', 3, 'w').should.eql('2021-04-24 18:45:12');
            scope.relDateToAbsolute('add', 2, 'M').should.eql('2021-07-15 18:45:12');
            scope.relDateToAbsolute('sub', 3, 'y').should.eql('2018-05-15 18:45:12');
        });

        it('clamps to the last day of the month rather than overflowing', function () {
            // 31 Jan + 1 month is 28 Feb, not 3 Mar
            freezeAt('2021-01-31T12:00:00Z');
            scope.relDateToAbsolute('add', 1, 'M').should.eql('2021-02-28 12:00:00');
            clock.restore();

            // ...and 29 Feb in a leap year
            freezeAt('2024-01-31T12:00:00Z');
            scope.relDateToAbsolute('add', 1, 'M').should.eql('2024-02-29 12:00:00');
            clock.restore();

            // 29 Feb - 1 year is 28 Feb
            freezeAt('2024-02-29T12:00:00Z');
            scope.relDateToAbsolute('sub', 1, 'y').should.eql('2023-02-28 12:00:00');
        });

        it('resolves against UTC, not the local time zone', function () {
            // A DST transition in the host zone must not change the result:
            // 2026-03-08 07:00Z is the US spring-forward
            freezeAt('2026-03-08T12:00:00Z');

            scope.relDateToAbsolute('sub', 1, 'd').should.eql('2026-03-07 12:00:00');
        });

        it('returns the current time when the amount is zero', function () {
            freezeAt('2021-05-15T18:45:12Z');

            scope.relDateToAbsolute('add', 0, 'd').should.eql('2021-05-15 18:45:12');
            scope.relDateToAbsolute('sub', 0, 'M').should.eql('2021-05-15 18:45:12');
        });
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
