const util = require('util');

const {add, sub} = require('date-fns');

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

module.exports = {
    ungroup(value) {
        return value.yg ? value.yg : value;
    },

    unescape(value) {
        var re = new RegExp('\\\\([\'"])', 'g');
        return value.replace(re, '$1');
    },

    relDateToAbsolute(op, amount, duration) {
        const now = new Date();
        const relDate = ops[op](now, {[intervals[duration]]: amount});

        return formatDateForSQL(relDate);
    },

    debug() {
        if (!process.env.DEBUG || !/nql/.test(process.env.DEBUG)) {
            return;
        }

        var string = arguments[0];
        var values = Array.prototype.slice.call(arguments, 1);
        var newArgs = [string];

        values.forEach(function (value) {
            newArgs.push(util.inspect(value, false, null));
        });

        console.log.apply(this, newArgs); // eslint-disable-line no-console
    }
};
