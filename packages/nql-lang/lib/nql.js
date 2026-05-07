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

// returns the JSON object
//
// `options.preserveRelativeDates` (default false): when true, relative-date
// expressions like `now-7d` are emitted as `{$relativeDate: {op, amount, unit}}`
// instead of being resolved to an absolute SQL-formatted date at parse time.
// This lets consumers (e.g. UI clients that need to render the relative form)
// distinguish "in the last 7 days" from a literal date comparison. Default
// behaviour is unchanged for callers that don't opt in.
exports.parse = (input, options) => {
    const opts = options || {};
    scope.preserveRelativeDates = opts.preserveRelativeDates === true;

    try {
        return parser.parse(input, opts);
    } finally {
        scope.preserveRelativeDates = false;
    }
};
