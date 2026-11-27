const scope = require('./scope');
const parser = require('../dist/parser').parser;
parser.yy = scope;

exports.lex = (input) => {
    parser.lexer.setInput(input);
    let lexed = parser.lexer.lex();
    const tokens = [];

    while (lexed !== parser.lexer.EOF) {
        tokens.push({token: parser.terminals_[lexed], matched: parser.lexer.match});
        lexed = parser.lexer.lex();
    }

    return tokens;
};

// The text keys of a parse that lists none, which is most of them
const NO_TEXT_KEYS = new Set();

// returns the JSON object
//
// `options.preserveRelativeDates` (default false): when true, relative-date
// expressions like `now-7d` are emitted as `{$relativeDate: {op, amount, unit}}`
// instead of being resolved to an absolute SQL-formatted date at parse time.
// This lets consumers (e.g. UI clients that need to render the relative form)
// distinguish "in the last 7 days" from a literal date comparison. Default
// behaviour is unchanged for callers that don't opt in.
//
// `options.textKeys` (default none): an array of keys whose values are always
// text, such as a key that names a record by its slug. A value of one of these
// keys written without quotes is read as the text it is written as, where it
// would otherwise be read as a number, null, true, false or a relative date:
// with `textKeys: ['tag']`, `tag:2024` is `{tag: '2024'}` and `tag:null` is
// `{tag: 'null'}`, as `tag:'2024'` and `tag:'null'` already are. So a listed
// key can't be compared with null, and a key that can be null shouldn't be
// listed. Keys are matched as the parsed filter names them, after `aliases`.
// The values of every other key are read as before.
exports.parse = (input, options) => {
    const opts = options || {};
    if (opts.textKeys !== undefined && !Array.isArray(opts.textKeys)) {
        //eslint-disable-next-line ghost/ghost-custom/no-native-error
        throw new Error('textKeys must be an array of keys');
    }
    scope.preserveRelativeDates = opts.preserveRelativeDates === true;
    scope.textKeys = opts.textKeys ? new Set(opts.textKeys) : NO_TEXT_KEYS;

    try {
        return parser.parse(input, opts);
    } finally {
        scope.preserveRelativeDates = false;
        scope.textKeys = NO_TEXT_KEYS;
    }
};
