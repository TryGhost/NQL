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
    });
});
