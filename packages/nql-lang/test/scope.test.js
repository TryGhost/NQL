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

    describe('normalizeAbsoluteDate', function () {
        it('converts an ISO date-time with a timezone offset to UTC db format', function () {
            scope.normalizeAbsoluteDate('2025-02-27T19:03:00.000-05:00')
                .should.equal('2025-02-28 00:03:00');
        });

        it('converts a Zulu ISO date-time to db format', function () {
            scope.normalizeAbsoluteDate('2025-02-27T19:03:00Z')
                .should.equal('2025-02-27 19:03:00');
        });

        it('supports a "T" date-time without seconds', function () {
            scope.normalizeAbsoluteDate('2025-02-27T19:03Z')
                .should.equal('2025-02-27 19:03:00');
        });

        it('truncates fractional seconds', function () {
            scope.normalizeAbsoluteDate('2025-02-27T19:03:00.567Z')
                .should.equal('2025-02-27 19:03:00');
        });

        it('interprets a zone-less date-time as UTC', function () {
            scope.normalizeAbsoluteDate('2025-02-27T19:03:00')
                .should.equal('2025-02-27 19:03:00');
        });

        it('is idempotent for a value already in db format', function () {
            scope.normalizeAbsoluteDate('2025-02-27 19:03:00')
                .should.equal('2025-02-27 19:03:00');
        });

        it('leaves space-separated date-times untouched (only the ISO "T" form is rewritten)', function () {
            scope.normalizeAbsoluteDate('2025-02-27 19:03')
                .should.equal('2025-02-27 19:03');
            scope.normalizeAbsoluteDate('2025-02-27 19:03:00Z')
                .should.equal('2025-02-27 19:03:00Z');
        });

        it('leaves calendar-invalid dates untouched instead of rolling them over', function () {
            // `new Date` would roll these to Mar 1 / May 1 rather than rejecting them
            scope.normalizeAbsoluteDate('2025-02-30T00:00:00Z')
                .should.equal('2025-02-30T00:00:00Z');
            scope.normalizeAbsoluteDate('2025-04-31T10:00:00Z')
                .should.equal('2025-04-31T10:00:00Z');
        });

        it('leaves out-of-range times untouched instead of rolling them over', function () {
            // 24:00 is spec-legal for `new Date` and rolls to next-day midnight
            scope.normalizeAbsoluteDate('2025-01-01T24:00:00Z')
                .should.equal('2025-01-01T24:00:00Z');
            scope.normalizeAbsoluteDate('2025-01-01T19:60:00Z')
                .should.equal('2025-01-01T19:60:00Z');
        });

        it('leaves a bare date untouched (no time component)', function () {
            scope.normalizeAbsoluteDate('2025-02-27').should.equal('2025-02-27');
        });

        it('leaves a non-date string untouched', function () {
            scope.normalizeAbsoluteDate('not-a-date').should.equal('not-a-date');
        });

        it('leaves an unparseable date-time shaped string untouched', function () {
            scope.normalizeAbsoluteDate('2025-13-45T99:99:99Z')
                .should.equal('2025-13-45T99:99:99Z');
        });

        it('returns non-string values unchanged', function () {
            (scope.normalizeAbsoluteDate(null) === null).should.be.true();
            scope.normalizeAbsoluteDate(5).should.equal(5);
            scope.normalizeAbsoluteDate(true).should.equal(true);
        });

        describe('with preserveRelativeDates flag set', function () {
            afterEach(function () {
                scope.preserveRelativeDates = false;
            });

            it('leaves absolute date-times untouched (lossless parse)', function () {
                scope.preserveRelativeDates = true;

                scope.normalizeAbsoluteDate('2025-02-27T19:03:00.000-05:00')
                    .should.equal('2025-02-27T19:03:00.000-05:00');
            });
        });
    });
});
