declare interface NQLQuery {
    lex: () => any;
    parse: () => any;
    queryJSON: (object: any) => boolean;
    querySQL: (qb: any) => any;
    toString: () => string;
    toJSON: () => any;
}

declare interface NQLOptions {
    transformer?: (parsed: any) => any;
    overrides?: any;
    defaults?: any;
    expansions?: Array<{key: string; replacement: string; expansion?: string}>
}

declare function nql(queryString: string, options?: NQLOptions): NQLQuery;

export = nql;
