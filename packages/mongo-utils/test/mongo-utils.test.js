// Switch these lines once there are useful utils
// const testUtils = require('./utils');
require('./utils');
const mongoUtils = require('../lib/mongo-utils');

describe('Find statement', () => {
    it('should match with object statement by key', function () {
        const statements = {status: 'published'};

        mongoUtils.findStatement(statements, 'page').should.eql(false);
        mongoUtils.findStatement(statements, 'status').should.eql(true);
        mongoUtils.findStatement(statements, 'tags').should.eql(false);
        mongoUtils.findStatement(statements, 'published').should.eql(false);
    });

    it('should match in object statement array by key', function () {
        const statements = [
            {page: false},
            {status: 'published'}
        ];

        mongoUtils.findStatement(statements, 'page').should.eql(true);
        mongoUtils.findStatement(statements, 'status').should.eql(true);
        mongoUtils.findStatement(statements, 'tags').should.eql(false);
        mongoUtils.findStatement(statements, 'published').should.eql(false);
    });

    it('should match in object statement array by key', function () {
        const statements = [
            {page: false},
            {status: 'published'}
        ];

        mongoUtils.findStatement(statements, 'page').should.eql(true);
        mongoUtils.findStatement(statements, 'status').should.eql(true);
        mongoUtils.findStatement(statements, 'tags').should.eql(false);
        mongoUtils.findStatement(statements, 'published').should.eql(false);
    });

    describe('nested $and/$or groups', function () {
        it('should match inside nested $and group', function () {
            const statements = {$and: [
                {page: false},
                {status: 'published'}
            ]};

            mongoUtils.findStatement(statements, 'page').should.eql(true);
            mongoUtils.findStatement(statements, 'status').should.eql(true);
            mongoUtils.findStatement(statements, 'tags').should.eql(false);
            mongoUtils.findStatement(statements, 'published').should.eql(false);
        });

        it('should match inside nested $or group', function () {
            const statements = {$or: [
                {page: false},
                {status: 'published'}
            ]};

            mongoUtils.findStatement(statements, 'page').should.eql(true);
            mongoUtils.findStatement(statements, 'status').should.eql(true);
            mongoUtils.findStatement(statements, 'tags').should.eql(false);
            mongoUtils.findStatement(statements, 'published').should.eql(false);
        });
    });
});

describe('Reject statements', () => {
    let rejectStatements;
    let testFunction;

    beforeEach(function () {
        rejectStatements = mongoUtils.rejectStatements;

        testFunction = (statements) => {
            return (match) => {
                return mongoUtils.findStatement(statements, match);
            };
        };
    });

    it('should reject from a simple object', () => {
        const statements = {featured: true};
        const filter = {featured: false};

        rejectStatements(statements, testFunction(filter))
            .should.eql({});
    });

    it('should NOT reject from a simple object when not matching', () => {
        const statements = {featured: true};
        const filter = {status: 'published'};

        rejectStatements(statements, testFunction(filter))
            .should.eql({featured: true});
    });

    it('returns filter intact if it is empty', () => {
        const statements = null;
        const filter = {featured: true};

        const output = rejectStatements(statements, testFunction(filter));

        should.equal(output, null);
    });

    it('rejects statements that match in filter in $or group', () => {
        const statements = {$or: [{
            featured: false
        }, {
            status: 'published'
        }]};

        const filter = {
            featured: true
        };

        const output = {$or: [{
            status: 'published'
        }]};

        rejectStatements(statements, testFunction(filter)).should.eql(output);
    });

    it('should remove group if all statements are removed', () => {
        const statements = {$or: [{
            featured: false
        }]};

        const filter = {
            featured: true
        };

        const output = {};

        rejectStatements(statements, testFunction(filter)).should.eql(output);
    });

    it('reduces statements if key matches with any keys in $and group', () => {
        const statements = {$or: [
            {page: false},
            {author: 'cameron'}
        ]};

        const filter = {$and: [
            {tag: 'photo'},
            {page: true}
        ]};

        const output = {$or: [
            {author: 'cameron'}
        ]};

        rejectStatements(statements, testFunction(filter)).should.eql(output);
    });

    it('should reject statements that are nested multiple levels', function () {
        const statements = {$and: [
            {$or: [
                {tag: {
                    $in: ['photo','video']
                }},
                {author: 'cameron'},
                {status: 'draft'}
            ]},
            {$and: [
                {status: 'draft'},
                {page: true}
            ]}
        ]};

        const filter = {status: 'published'};

        const output = {$and: [
            {$or: [
                {tag: {
                    $in: ['photo','video']
                }},
                {author: 'cameron'}
            ]},
            {$and: [
                {page: true}
            ]}
        ]};

        rejectStatements(statements, testFunction(filter)).should.eql(output);
    });
});

describe('Combine Filters', function () {
    let combineFilters;

    beforeEach(function () {
        combineFilters = mongoUtils.combineFilters;
    });

    it('should return nothing when no filters are passed in', function () {
        should.equal(combineFilters(undefined, undefined), undefined);
    });

    it('should return unmodified primary filter when secondary is not passed in', function () {
        combineFilters({status: 'published'}).should.eql({status: 'published'});
    });

    it('should return unmodified secondary filter when primary is not defined in', function () {
        combineFilters(undefined, {status: 'published'}).should.eql({status: 'published'});
    });

    it('should combine two filters in $and statement', function () {
        combineFilters({page: true}, {status: 'published'}).should.eql({
            $and: [
                {page: true},
                {status: 'published'}
            ]
        });
    });
});

describe('Expand filters', () => {
    let expandFilters;

    beforeEach(function () {
        expandFilters = mongoUtils.expandFilters;
    });

    it('should return unchanged filter when no expansions match', function () {
        expandFilters({status: 'published'}, []).should.eql({status: 'published'});
    });

    it('should substitute single alias without expansion', function () {
        const filter = {primary_tag: 'en'};
        const expansions = [{
            key: 'primary_tag',
            replacement: 'tags.slug'
        }];

        const processed = {'tags.slug': 'en'};

        expandFilters(filter, expansions).should.eql(processed);
    });

    it('should substitute single alias', function () {
        const filter = {primary_tag: 'en'};
        const expansions = [{
            key: 'primary_tag',
            replacement: 'tags.slug',
            expansion: {order: 0}
        }];

        const processed = {$and: [
            {'tags.slug': 'en'},
            {order: 0}
        ]};

        expandFilters(filter, expansions).should.eql(processed);
    });

    it('should substitute single alias with multiple expansions', function () {
        const filter = {primary_tag: 'en'};
        const expansions = [{
            key: 'primary_tag',
            replacement: 'tags.slug',
            expansion: {$and: [{order: 0}, {visibility: 'public'}]}
        }];

        const processed = {$and: [
            {'tags.slug': 'en'},
            {order: 0},
            {visibility: 'public'}
        ]};

        expandFilters(filter, expansions).should.eql(processed);
    });

    it('should substitute filter with negation and - sign', function () {
        const filter = {
            primary_tag: {
                $ne: 'great-movies'
            }
        };
        const expansions = [{
            key: 'primary_tag',
            replacement: 'tags.slug',
            expansion: {order: 0}
        }];

        const processed = {$and: [
            {'tags.slug': {
                $ne: 'great-movies'
            }},
            {order: 0}
        ]};

        expandFilters(filter, expansions).should.eql(processed);
    });

    it('should NOT match similarly named filter keys', function () {
        const filter = {tags: 'hello'};
        const expansions = [{
            key: 'tag',
            replacement: 'tags.slug',
            expansion: {order: 0}
        }];

        const processed = {tags: 'hello'};

        expandFilters(filter, expansions).should.eql(processed);
    });

    it('should substitute IN notation single alias', function () {
        const filter = {primary_tag: {
            $in: ['en', 'es']
        }};
        const expansions = [{
            key: 'primary_tag',
            replacement: 'tags.slug',
            expansion: {order: 0}
        }];

        const processed = {$and: [
            {'tags.slug': {$in: ['en', 'es']}},
            {order: 0}
        ]};

        expandFilters(filter, expansions).should.eql(processed);
    });

    it('should substitute single alias nested in $and statement', function () {
        const filter = {$and: [
            {status: 'published'},
            {featured: true},
            {primary_tag: {$in: ['en', 'es']}}
        ]};
        const expansions = [{
            key: 'primary_tag',
            replacement: 'tags.slug',
            expansion: {order: 0}
        }];

        const processed = {$and: [
            {status: 'published'},
            {featured: true},
            {$and: [
                {'tags.slug': {$in: ['en', 'es']}},
                {order: 0}]}
        ]};

        expandFilters(filter, expansions).should.eql(processed);
    });

    it('should substitute multiple occurrences of the filter with expansions', function () {
        const filter = {$and: [
            {status: 'published'},
            {primary_tag: 'de'},
            {featured: true},
            {primary_tag: 'en'}
        ]};
        const expansions = [{
            key: 'primary_tag',
            replacement: 'tags.slug',
            expansion: {order: 0}
        }];

        const processed = {$and: [
            {status: 'published'},
            {$and: [
                {'tags.slug': 'de'},
                {order: 0}
            ]},
            {featured: true},
            {$and: [
                {'tags.slug': 'en'},
                {order: 0}
            ]}
        ]};

        expandFilters(filter, expansions).should.eql(processed);
    });

    it('should substitute multiple nested on different levels occurrences', function () {
        const filter = {$and: [
            {status: 'published'},
            {primary_tag: 'de'},
            {featured: true},
            {$or: [
                {primary_tag: 'us'},
                {primary_tag: 'es'}
            ]}
        ], $or: [
            {primary_tag: 'pl'}
        ]};
        const expansions = [{
            key: 'primary_tag',
            replacement: 'tags.slug',
            expansion: {order: 0}
        }];

        const processed = {$and: [
            {status: 'published'},
            {$and: [
                {'tags.slug': 'de'},
                {order: 0}
            ]},
            {featured: true},
            {$or: [
                {$and: [
                    {'tags.slug': 'us'},
                    {order: 0}
                ]},
                {$and: [
                    {'tags.slug': 'es'},
                    {order: 0}
                ]}
            ]}
        ], $or: [
            {$and: [
                {'tags.slug': 'pl'},
                {order: 0}
            ]}
        ]};

        expandFilters(filter, expansions).should.eql(processed);
    });

    it('combine multiple expansions', function () {
        const filter = {$and: [{primary_tag: 'yalla'},{primary_author: 'hulk'}]};

        const expansions = [{
            key: 'primary_tag',
            replacement: 'tags.slug',
            expansion: {order: 0}
        }, {
            key: 'primary_author',
            replacement: 'authors.slug',
            expansion: {order: 0}
        }];

        const processed = {
            $and: [
                {
                    $and: [
                        {
                            'tags.slug': 'yalla'
                        },
                        {
                            order: 0
                        }
                    ]
                },
                {
                    $and: [
                        {
                            'authors.slug': 'hulk'
                        },
                        {
                            order: 0
                        }
                    ]
                }
            ]
        };

        expandFilters(filter, expansions).should.eql(processed);
    });
});
