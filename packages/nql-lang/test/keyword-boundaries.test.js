const assert = require('node:assert/strict');
const {lex, parse} = require('../');

describe('Keyword boundaries', function () {
    const keywords = [
        {word: 'null', spellings: ['null', 'NULL', 'Null'], token: 'NULL', value: null},
        {word: 'true', spellings: ['true', 'TRUE', 'True'], token: 'TRUE', value: true},
        {word: 'false', spellings: ['false', 'FALSE', 'False'], token: 'FALSE', value: false}
    ];
    const separators = [
        ['+', 'AND'], [',', 'OR'], ['(', 'LPAREN'], [')', 'RPAREN'],
        ['[', 'LBRACKET'], [']', 'RBRACKET'], ['>', 'GT'], ['<', 'LT'],
        ['>=', 'GTE'], ['<=', 'LTE'], ['~', 'CONTAINS'],
        ['~^', 'STARTSWITH'], ['~$', 'ENDSWITH']
    ];
    // Every ECMAScript whitespace/line-terminator code point matched by \s.
    const whitespace = [
        '\t', '\n', '\v', '\f', '\r', ' ', '\u00a0', '\u1680',
        '\u2000', '\u2001', '\u2002', '\u2003', '\u2004', '\u2005',
        '\u2006', '\u2007', '\u2008', '\u2009', '\u200a', '\u2028',
        '\u2029', '\u202f', '\u205f', '\u3000', '\ufeff'
    ];
    const escapable = ['\'', '"', '+', ',', '(', ')', '>', '<', '=', '[', ']', '~', '^', '$'];
    const literalSuffixes = [
        'a', 'Z', '0', '9', '_', '-', '.', '/', '\\', '^', '$', '!', '?',
        '*', '&', '|', '{', '}', '@', '#', '%', ';', '`', '\0', '\u0085',
        '\u180e', '\u200b', 'é', '中', '😀', '\ud800', '\udfff',
        'null', 'true', 'false', '-value', '_value', '.value'
    ];

    for (const {word, spellings, token, value} of keywords) {
        for (const spelling of spellings) {
            describe(spelling, function () {
                const keywordToken = {token, matched: spelling};

                it('recognises a keyword at end of input', function () {
                    assert.deepEqual(lex(spelling), [keywordToken]);
                    assert.deepEqual(parse(`value:${spelling}`), {value});
                });

                it('preserves every operator boundary and subsequent token', function () {
                    for (const [separator, separatorToken] of separators) {
                        assert.deepEqual(lex(`${spelling}${separator}other`), [
                            keywordToken,
                            {token: separatorToken, matched: separator},
                            {token: 'LITERAL', matched: 'other'}
                        ], JSON.stringify(separator));
                    }
                });

                it('preserves all whitespace boundaries', function () {
                    for (const space of whitespace) {
                        assert.deepEqual(lex(`${space}${spelling}${space}other`), [
                            keywordToken, {token: 'LITERAL', matched: 'other'}
                        ], JSON.stringify(space));
                        assert.deepEqual(parse(`value:${spelling}${space}`), {value});
                    }
                });

                it('keeps keyword-prefixed literals intact', function () {
                    for (const suffix of literalSuffixes) {
                        const literal = spelling + suffix;
                        assert.deepEqual(lex(literal), [{token: 'LITERAL', matched: literal}], JSON.stringify(suffix));
                        assert.deepEqual(parse(`value:${literal}`), {value: literal});
                    }
                });

                it('keeps every escaped operator or quote in the literal', function () {
                    for (const character of escapable) {
                        for (const tail of ['', 'other', '\\', '\\+tail']) {
                            const literal = `${spelling}\\${character}${tail}`;
                            assert.deepEqual(lex(literal), [{token: 'LITERAL', matched: literal}], JSON.stringify(literal));
                        }
                        // Parsing unescapes quotes, but preserves backslashes before operators.
                        const parsed = (character === '\'' || character === '"') ? spelling + character : `${spelling}\\${character}`;
                        assert.deepEqual(parse(`value:${spelling}\\${character}`), {value: parsed});
                    }
                });

                it('preserves backslashes before whitespace, boundaries and end of input', function () {
                    for (const count of [1, 2, 3, 8, 32]) {
                        const literal = spelling + '\\'.repeat(count);
                        assert.deepEqual(lex(literal), [{token: 'LITERAL', matched: literal}]);
                        assert.deepEqual(lex(`${literal} other`), [
                            {token: 'LITERAL', matched: literal}, {token: 'LITERAL', matched: 'other'}
                        ]);
                        assert.deepEqual(lex(`${literal}+,other`), [
                            {token: 'LITERAL', matched: `${literal}+`},
                            {token: 'OR', matched: ','}, {token: 'LITERAL', matched: 'other'}
                        ]);
                    }
                });

                it('preserves property names and quoted strings', function () {
                    assert.deepEqual(lex(`${spelling}:other`), [
                        {token: 'PROP', matched: `${spelling}:`}, {token: 'LITERAL', matched: 'other'}
                    ]);
                    assert.deepEqual(parse(`${spelling}:other`), {[spelling]: 'other'});
                    assert.deepEqual(lex(`'${spelling}'`), [{token: 'STRING', matched: `'${spelling}'`}]);
                    assert.deepEqual(parse(`value:'${spelling}'`), {value: spelling});
                    assert.deepEqual(parse(`value:prefix${spelling}`), {value: `prefix${spelling}`});
                });

                it('preserves negation, lists, grouping and logical operators', function () {
                    assert.deepEqual(parse(`value:-${spelling}`), {value: {$ne: value}});
                    assert.deepEqual(parse(`value:[${spelling},'${spelling}',${spelling}ish]`), {
                        value: {$in: [value, spelling, `${spelling}ish`]}
                    });
                    assert.deepEqual(parse(`value:-[${spelling}]`), {value: {$nin: [value]}});
                    assert.deepEqual(parse(`(value:${spelling}+other:1),last:2`), {
                        $or: [{$and: [{value}, {other: 1}]}, {last: 2}]
                    });
                });

                it('still rejects malformed input after a keyword', function () {
                    for (const suffix of ['=', '"', '\'', '\'unterminated']) {
                        assert.throws(() => lex(spelling + suffix), /^Error: Query Error: unrecognized text/);
                        assert.throws(() => parse(`value:${spelling}${suffix}`), /^Error: Query Error:/);
                    }
                    for (const suffix of ['+', ',', '>', '<', '~', '[', ')']) {
                        assert.throws(() => parse(`value:${spelling}${suffix}`), /^Error: Query Error:/);
                    }
                });

                it('handles long literal and escaped suffixes without changing token boundaries', function () {
                    for (const suffix of ['a'.repeat(16384), '\\'.repeat(16384), '\\+'.repeat(8192)]) {
                        const literal = spelling + suffix + 'tail';
                        assert.deepEqual(lex(`${literal},other`), [
                            {token: 'LITERAL', matched: literal}, {token: 'OR', matched: ','},
                            {token: 'LITERAL', matched: 'other'}
                        ]);
                    }
                });
            });
        }

        it(`preserves recognition of every case permutation of ${word}`, function () {
            for (let mask = 0; mask < 2 ** word.length; mask += 1) {
                const spelling = [...word].map((character, index) => (mask & (1 << index) ? character.toUpperCase() : character)).join('');
                const isKeyword = spellings.includes(spelling);
                assert.deepEqual(lex(spelling), [{token: isKeyword ? token : 'LITERAL', matched: spelling}]);
                assert.deepEqual(parse(`value:${spelling}`), {value: isKeyword ? value : spelling});
            }
        });
    }
});
