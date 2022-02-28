/* lexical grammar */

%lex

omitops                      [^\s'"\+\,\(\)\>\<=\[\]\-]
omitopsbarnot                [^\s'"\+\,\(\)\>\<=\[\]]
escapable                    ['"\+\,\(\)\>\<=\[\]]


%%

\s+                                                         /* skip whitespace */
(?:null|NULL|Null)(?!(\\{escapable}|{omitopsbarnot})+)      return 'NULL';
(?:true|TRUE|True)(?!(\\{escapable}|{omitopsbarnot})+)      return 'TRUE';
(?:false|FALSE|False)(?!(\\{escapable}|{omitopsbarnot})+)   return 'FALSE';
[a-zA-Z_][a-zA-Z0-9_\.]*[:]                                 return 'PROP';
[0-9]+(\.[0-9]+)?\b(?![\-])                                 return 'NUMBER';
'['                                                         return 'LBRACKET';
']'                                                         return 'RBRACKET';
{omitops}(\\{escapable}|{omitopsbarnot})+                   return 'LITERAL';
['](\\['"]|[^'"])+?[']                                      return 'STRING';
'('                                                         return 'LPAREN';
')'                                                         return 'RPAREN';
','                                                         return 'OR';
'+'                                                         return 'AND';
'-'                                                         return 'NOT';
'>='                                                        return 'GTE';
'<='                                                        return 'LTE';
'>'                                                         return 'GT';
'<'                                                         return 'LT';


%%

lexer.parseError = function(errStr, object) {
    var lines = errStr.split("\n"),
        caretPos,
        char;

    caretPos = lines[2].indexOf("^");
    char = lines[1].charAt(caretPos);
    lines[0] = "Query Error: unrecognized text \"" + char + "\" in filter at char " + (caretPos + 1);

    throw Error(lines.join("\n"));
}
