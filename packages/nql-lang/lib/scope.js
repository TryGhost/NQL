const util = require('util');

const add = require('date-fns/add');
const sub = require('date-fns/sub');

const ops = {
    add,
    sub
};

const intervals = {
    d: 'days',
    w: 'weeks',
    M: 'months',
    y: 'years',
    h: 'hours',
    m: 'minutes',
    s: 'seconds'
};

/**
 * Return a string "year-month-day hours:minutes:seconds"
 * This format works for both SQLite3 and MySQL when used with >
 * We don't use date-fns format because it always outputs local time and we want UTC
 * This is a bit of a hack, but it's the least amount of code that gives us the right thing
 * @TODO: add proper tests for this
 *
 * @param {Date} date
 * @returns {String} formattedDate in the form "year-month-day hours:minutes:seconds"
 */
const formatDateForSQL = (date) => {
    const isoDate = date.toISOString();
    // Replace the T with a space, and strip the milliseconds and timezone from the end of the string
    return isoDate.replace('T', ' ').replace(/\.[0-9]{3}Z/, '');
};

// A full ISO-8601 date-time: a date WITH a "T"-separated time component,
// optionally with fractional seconds and a timezone (Z or ±HH:MM). We
// deliberately require a time component so bare dates ("2025-02-27") and any
// other plain string are never rewritten — nql-lang has no column-type
// information, so this is the only shape we can safely normalize without
// risking a legitimate non-date value (e.g. a date-like slug). The "T"
// separator is required for the same reason: space-separated values are
// already in the stored format (or arbitrary text), and only the ISO "T" form
// exhibits the comparison bug being fixed. Hour/minute/second ranges are
// enforced so out-of-range times ("T24:00") can't slip through to `new Date`,
// which would roll them over to a different day instead of rejecting them.
// Groups: 1=date, 2=time (HH:mm[:ss]), 3=fraction, 4=zone.
const ISO_DATE_TIME = /^(\d{4}-\d{2}-\d{2})T((?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?)(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;

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

        const now = new Date();
        const relDate = ops[op](now, {[intervals[duration]]: amount});

        return formatDateForSQL(relDate);
    },

    // Normalizes an absolute date-time value to the format dates are stored in
    // ("YYYY-MM-DD HH:mm:ss", UTC) — the same format `relDateToAbsolute`
    // produces for relative dates. This makes date comparisons behave
    // identically on SQLite (where datetimes are text compared lexically, so a
    // raw ISO "T" sorts after the stored space separator) and MySQL (which
    // otherwise drops the timezone offset instead of applying it). A value that
    // isn't a full ISO-8601 date-time, or that fails to parse, is returned
    // untouched.
    normalizeAbsoluteDate(value) {
        // `preserveRelativeDates` opts in to a lossless parse (values survive
        // for rendering/round-tripping), so absolute dates must survive
        // untouched there too.
        if (this.preserveRelativeDates || typeof value !== 'string') {
            return value;
        }

        const match = ISO_DATE_TIME.exec(value);
        if (!match) {
            return value;
        }

        const [, date, time, fraction = '', zone] = match;

        // `new Date` rejects most out-of-range fields but silently rolls over
        // days that are ≤31 yet invalid for their month (Feb 30 → Mar 1), which
        // would make the filter query a different day than the user wrote.
        const dayCheck = new Date(`${date}T00:00:00Z`);
        if (Number.isNaN(dayCheck.getTime()) || dayCheck.toISOString().slice(0, 10) !== date) {
            return value;
        }

        // A zone-less value is interpreted as UTC (dates are stored in UTC), so
        // we append "Z" rather than letting `new Date` treat it as local time.
        const isoString = `${date}T${time}${fraction}${zone || 'Z'}`;
        const parsed = new Date(isoString);

        return Number.isNaN(parsed.getTime()) ? value : formatDateForSQL(parsed);
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
