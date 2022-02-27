const util = require('util');
const ops = {
    add: require('date-fns/add'),
    sub: require('date-fns/sub')
};
const format = require('date-fns/formatRFC3339');

const intervals = {
    d: 'days',
    w: 'weeks',
    M: 'months',
    y: 'years',
    h: 'hours',
    m: 'minutes',
    s: 'seconds'
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
        const finalDate = ops[op](now, {[intervals[duration]]: amount});

        return format(finalDate);
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
