const util = require('util');

const {DateTime} = require('luxon');

const intervals = {
    d: 'days',
    w: 'weeks',
    M: 'months',
    y: 'years',
    h: 'hours',
    m: 'minutes',
    s: 'seconds'
};

// "year-month-day hours:minutes:seconds", which works for both SQLite3 and
// MySQL when used with >. Note that `toSQL()` looks like the obvious call here
// but appends milliseconds, which we don't want.
const SQL_FORMAT = 'yyyy-MM-dd HH:mm:ss';

module.exports = {
    ungroup(value) {
        return value.yg ? value.yg : value;
    },

    unescape(value) {
        const re = new RegExp('\\\\([\'"])', 'g');
        return value.replace(re, '$1');
    },

    stringToRegExp(value, modifier) {
        let escapedValue = value.replace(/[.*+?^$(){}|[\]\\]/g, '\\$&');

        if (modifier === '^') {
            escapedValue = '^' + escapedValue;
        } else if (modifier === '$') {
            escapedValue = escapedValue + '$';
        }

        return new RegExp(escapedValue, 'i');
    },

    relDateToAbsolute(op, amount, duration) {
        // When the parse caller has opted in via `preserveRelativeDates: true`,
        // emit a tagged value so consumers can distinguish a relative-date
        // expression from an absolute one. The default path resolves the
        // relative form to an absolute SQL-formatted date as before.
        if (this.preserveRelativeDates) {
            return {$relativeDate: {op, amount: Number(amount), unit: intervals[duration]}};
        }

        // Resolve against UTC explicitly. The output is compared against stored
        // UTC timestamps, so the calendar arithmetic has to happen in UTC too -
        // doing it in the server's local zone makes "now-1d" 23 or 25 hours
        // either side of a DST transition.
        const now = DateTime.utc();
        const relDuration = {[intervals[duration]]: Number(amount)};
        const relDate = op === 'add' ? now.plus(relDuration) : now.minus(relDuration);

        return relDate.toFormat(SQL_FORMAT);
    },

    debug() {
        if (!process.env.DEBUG || !/nql/.test(process.env.DEBUG)) {
            return;
        }

        const string = arguments[0];
        const values = Array.prototype.slice.call(arguments, 1);
        const newArgs = [string];

        values.forEach(function (value) {
            newArgs.push(util.inspect(value, false, null));
        });

        console.log.apply(this, newArgs); // eslint-disable-line no-console
    }
};
