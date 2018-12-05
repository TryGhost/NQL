const utils = require('../utils');
const knex = utils.db.client;

const convertor = require('../../lib/convertor');

/* eslint-disable no-console*/

// @TODO: the config object is not designed yet.
const makeQuery = query => convertor(knex('posts'), query, {
    relations: {
        tags: {
            tableName: 'tags',
            type: 'manyToMany',
            join_table: 'posts_tags',
            join_from: 'post_id',
            join_to: 'tag_id'
        },
        authors: {
            tableName: 'users',
            type: 'oneToMany',
            join_from: 'author_id'
        }
    }
});

// Integration tests build a test database and
// check that we get the exact data we expect from each query
describe('Relations', function () {
    before(utils.db.teardown());
    before(utils.db.setup());
    after(utils.db.teardown());

    describe.skip('One-to-Many', function () {
        beforeEach(utils.db.init('one-to-many'));
        afterEach(utils.db.reset());

        it('can match array in (single value)', function (done) {
            const queryJSON = {'authors.slug': {$in: ['sam']}};

            // Use the queryJSON to build a query
            const query = makeQuery(queryJSON);

            // Check any intermediate values
            console.log(query.toQuery());

            // Perform the query against the DB
            query.select()
                .then((result) => {
                    console.log(result);

                    result.should.be.an.Array().with.lengthOf(2);

                    // Check we get the right data
                    // result.should.do.something;

                    done();
                })
                .catch(done);
        });

        it('can match array in (multiple values)', function (done) {
            const queryJSON = {'authors.name': {$in: ['Sam Smith', 'Pat Taylor']}};

            // Use the queryJSON to build a query
            const query = makeQuery(queryJSON);

            // Check any intermediate values
            console.log('query', query.toQuery());

            // Perform the query against the DB
            query.select()
                .then((result) => {
                    console.log(result);

                    result.should.be.an.Array().with.lengthOf(5);

                    // Check we get the right data
                    // result.should.do.something;

                    done();
                })
                .catch(done);
        });
    });

    describe('Many-to-Many', function () {
        before(utils.db.init('many-to-many'));

        describe('EQUALS $eq', function () {
            it('tags.slug equals "animal"', function () {
                const mongoJSON = {
                    'tags.slug': 'animal'
                };

                const query = makeQuery(mongoJSON);

                return query
                    .select()
                    .then((result) => {
                        result.should.be.an.Array().with.lengthOf(3);
                    });
            });

            it('tags.visibility equals "internal"', function () {
                const mongoJSON = {
                    'tags.visibility': 'internal'
                };

                const query = makeQuery(mongoJSON);

                return query
                    .select()
                    .then((result) => {
                        result.should.be.an.Array().with.lengthOf(1);
                    });
            });
        });

        describe('NEGATION $ne', function () {
            // should return posts without tags
            // if a post has more than 1 tag, if one tag is animal, do not return
            it('tags.slug is NOT "animal"', function () {
                const mongoJSON = {
                    'tags.slug': {
                        $ne: 'animal'
                    }
                };

                const query = makeQuery(mongoJSON);

                return query
                    .select()
                    .then((result) => {
                        result.should.be.an.Array().with.lengthOf(5);
                    });
            });

            it('tags.visibility is NOT "public"', function () {
                const mongoJSON = {
                    'tags.visibility': {
                        $ne: 'public'
                    }
                };

                const query = makeQuery(mongoJSON);

                return query
                    .select()
                    .then((result) => {
                        result.should.be.an.Array().with.lengthOf(2);
                    });
            });
        });

        describe('AND $and', function () {
            it('tags.slug is animal and classic', function () {
                const mongoJSON = {
                    $and: [
                        {
                            'tags.slug': 'animal'
                        },
                        {
                            'tags.slug': 'classic'
                        }
                    ]
                };

                const query = makeQuery(mongoJSON);

                return query
                    .select()
                    .then((result) => {
                        result.should.be.an.Array().with.lengthOf(2);
                    });
            });

            it('tags.slug is hash-internal and tags.visibility is private', function () {
                const mongoJSON = {
                    $and: [
                        {
                            'tags.slug': 'hash-internal'
                        },
                        {
                            'tags.visibility': 'internal'
                        }
                    ]
                };

                const query = makeQuery(mongoJSON);

                return query
                    .select()
                    .then((result) => {
                        result.should.be.an.Array().with.lengthOf(1);
                        result[0].title.should.equal('has internal tag');
                    });
            });

            it('tags.slug is animal and tags.slug NOT in [classic]', function () {
                const mongoJSON = {
                    $and: [
                        {
                            'tags.slug': 'animal'
                        },
                        {
                            'tags.slug': {
                                $nin: ['classic']
                            }
                        }
                    ]
                };

                const query = makeQuery(mongoJSON);

                return query
                    .select()
                    .then((result) => {
                        result.should.be.an.Array().with.lengthOf(1);
                        result[0].title.should.equal('The Bare Necessities');
                    });
            });

            it('tags.slug is animal and sort_order is 0 and tags.visibility=public', function () {
                const mongoJSON = {
                    $and: [
                        {
                            'tags.slug': 'animal'
                        },
                        {
                            'posts_tags.sort_order': 0
                        }
                    ]
                };

                const query = makeQuery(mongoJSON);

                return query
                    .select()
                    .then((result) => {
                        result.should.be.an.Array().with.lengthOf(1);
                        result[0].title.should.equal('The Bare Necessities');
                    });
            });

            it('(tags.slug is animal and sort_order is 0) and tags.visibility=public', function () {
                const mongoJSON = {
                    $and: [
                        {
                            $and: [
                                {
                                    'tags.slug': 'animal'
                                },
                                {
                                    'posts_tags.sort_order': 0
                                }
                            ]
                        },
                        {
                            'tags.visibility': 'public'
                        }
                    ]
                };

                const query = makeQuery(mongoJSON);

                return query
                    .select()
                    .then((result) => {
                        result.should.be.an.Array().with.lengthOf(1);
                        result[0].title.should.equal('The Bare Necessities');
                    });
            });

            it('tags.slug is animal and sort_order is 0 and tags.visibility=public', function () {
                const mongoJSON = {
                    $and: [
                        {
                            'tags.slug': 'animal'
                        },
                        {
                            'posts_tags.sort_order': 0
                        },
                        {
                            'tags.visibility': 'public'
                        }
                    ]
                };

                const query = makeQuery(mongoJSON);

                return query
                    .select()
                    .then((result) => {
                        result.should.be.an.Array().with.lengthOf(1);
                    });
            });

            it('tags.slug is NOT animal and tags.slug is NOT cgi', function () {
                // equivalent to $nin: ['animal', 'cgi']
                const mongoJSON = {
                    $and: [
                        {
                            'tags.slug': {
                                $ne: 'animal'
                            }
                        },
                        {
                            'tags.slug': {
                                $ne: 'cgi'
                            }
                        }
                    ]
                };

                const query = makeQuery(mongoJSON);

                return query
                    .select()
                    .then((result) => {
                        result.should.be.an.Array().with.lengthOf(4);
                    });
            });

            it('tags.slug NOT equal "classic" and tags.visibility is equal "public"', function () {
                const mongoJSON = {
                    'tags.visibility': 'public',
                    'tags.slug': {
                        $ne: 'classic'
                    }
                };

                const query = makeQuery(mongoJSON);

                return query
                    .select()
                    .then((result) => {
                        result.should.be.an.Array().with.lengthOf(2);
                        result[0].title.should.equal('The Bare Necessities');
                        result[1].title.should.equal('When She Loved Me');
                    });
            });

            it('tags.slug NOT equal "classic" and tags.visibility is equal "public"', function () {
                const mongoJSON = {
                    'tags.visibility': 'public',
                    'tags.slug': {
                        $nin: ['classic']
                    }
                };

                const query = makeQuery(mongoJSON);

                return query
                    .select()
                    .then((result) => {
                        result.should.be.an.Array().with.lengthOf(2);
                        result[0].title.should.equal('The Bare Necessities');
                        result[1].title.should.equal('When She Loved Me');
                    });
            });

            it('(tags.slug NOT  IN "classic" and tags.visibility is equal "public")', function () {
                // this case can be generated with:
                // 'tags.slug:-classic+tags.visibility:public'
                const mongoJSON = {
                    $and: [
                        {
                            'tags.visibility': 'public'
                        },
                        {
                            'tags.slug': {
                                $nin: ['classic']
                            }
                        }
                    ]
                };

                const query = makeQuery(mongoJSON);
                // NOTE: this query is generating a group, this should be avoided
                // as we can't group negated properties with other, unless those
                // are going through connecting table
                return query
                    .select()
                    .then((result) => {
                        result.should.be.an.Array().with.lengthOf(2);
                        result[0].title.should.equal('The Bare Necessities');
                        result[1].title.should.equal('When She Loved Me');
                    });
            });
        });

        describe('OR $or', function () {
            it('(tags.slug = animal and sort_order = 0) OR visibility:internal', function () {
                const mongoJSON = {
                    $or: [
                        {
                            $and: [
                                {
                                    'tags.slug': 'animal'
                                },
                                {
                                    'posts_tags.sort_order': 0
                                }
                            ]
                        },
                        {
                            'tags.visibility': 'internal'
                        }
                    ]
                };

                const query = makeQuery(mongoJSON);

                return query
                    .select()
                    .then((result) => {
                        result.should.be.an.Array().with.lengthOf(2);
                    });
            });

            it('tags.slug = animal OR sort_order = 0 OR visibility:internal', function () {
                const mongoJSON = {
                    $or: [
                        {
                            'tags.slug': 'animal'
                        },
                        {
                            'posts_tags.sort_order': 0
                        },
                        {
                            'tags.visibility': 'internal'
                        }
                    ]
                };

                const query = makeQuery(mongoJSON);

                return query
                    .select()
                    .then((result) => {
                        result.should.be.an.Array().with.lengthOf(7);
                    });
            });
        });

        describe('IN $in', function () {
            it('tags.slug IN (animal)', function () {
                const mongoJSON = {
                    'tags.slug': {
                        $in: ['animal']
                    }
                };

                const query = makeQuery(mongoJSON);

                return query
                    .select()
                    .then((result) => {
                        result.should.be.an.Array().with.lengthOf(3);
                    });
            });

            it('tags.slug IN (animal, cgi)', function () {
                const mongoJSON = {
                    'tags.slug': {
                        $in: ['animal', 'cgi']
                    }
                };

                const query = makeQuery(mongoJSON);

                return query
                    .select()
                    .then((result) => {
                        result.should.be.an.Array().with.lengthOf(4);
                    });
            });

            it('tags.id IN (2,3)', function () {
                const mongoJSON = {
                    'tags.id': {
                        $in: [2, 3]
                    }
                };

                const query = makeQuery(mongoJSON);

                return query
                    .select()
                    .then((result) => {
                        result.should.be.an.Array().with.lengthOf(4);
                    });
            });

            it('tags.slug IN (animal) AND featured:true', function () {
                const mongoJSON = {
                    $and: [
                        {
                            'tags.slug': {
                                $in: ['animal']
                            }
                        },
                        {
                            featured: true
                        }
                    ]
                };

                const query = makeQuery(mongoJSON);

                return query
                    .select()
                    .then((result) => {
                        result.should.be.an.Array().with.lengthOf(2);
                    });
            });
        });

        describe('NOT IN $nin', function () {
            it('tags.slug NOT IN (animal)', function () {
                const mongoJSON = {
                    'tags.slug': {
                        $nin: ['animal']
                    }
                };

                const query = makeQuery(mongoJSON);

                return query
                    .select()
                    .then((result) => {
                        result.should.be.an.Array().with.lengthOf(5);
                    });
            });

            it('tags.slug NOT IN (animal, cgi)', function () {
                const mongoJSON = {
                    'tags.slug': {
                        $nin: ['animal', 'cgi']
                    }
                };

                const query = makeQuery(mongoJSON);

                return query
                    .select()
                    .then((result) => {
                        result.should.be.an.Array().with.lengthOf(4);
                    });
            });

            it('tags.id NOT IN (2,3)', function () {
                const mongoJSON = {
                    'tags.id': {
                        $nin: [2, 3]
                    }
                };

                const query = makeQuery(mongoJSON);

                return query
                    .select()
                    .then((result) => {
                        result.should.be.an.Array().with.lengthOf(4);
                    });
            });

            it('tags.slug NOT IN (classic, animal) AND featured:true', function () {
                const mongoJSON = {
                    $and: [
                        {
                            'tags.slug': {
                                $nin: ['classic', 'animal']
                            }
                        },
                        {
                            featured: true
                        }
                    ]
                };

                const query = makeQuery(mongoJSON);

                return query
                    .select()
                    .then((result) => {
                        result.should.be.an.Array().with.lengthOf(3);
                        result[0].title.should.equal('When She Loved Me');
                        result[1].title.should.equal('no tags, yeah');
                        result[2].title.should.equal('has internal tag');
                    });
            });
        });

        describe('Multiple where clauses for relations', function () {
            it('tags.slug equals "cgi" and posts_tags.sort_order is 0 and featured is true', function () {
                // where primary tag is "cgi"
                const mongoJSON = {
                    $and: [
                        {
                            $and: [
                                {
                                    'tags.slug': 'cgi'
                                },
                                {
                                    'posts_tags.sort_order': 0
                                }
                            ]

                        },
                        {
                            featured: true
                        }
                    ]
                };

                const query = makeQuery(mongoJSON);

                return query
                    .select()
                    .then((result) => {
                        result.should.be.an.Array().with.lengthOf(1);
                        result[0].title.should.equal('When She Loved Me');
                    });
            });

            it('tags.slug equals "animal" and posts_tags.sort_order is 0 and featured is false', function () {
                // where primary tag is "animal"
                const mongoJSON = {
                    $and: [
                        {
                            $and: [
                                {
                                    'tags.slug': 'animal'
                                },
                                {
                                    'posts_tags.sort_order': 0
                                }
                            ]
                        },
                        {
                            featured: false
                        }
                    ]
                };

                const query = makeQuery(mongoJSON);

                return query
                    .select()
                    .then((result) => {
                        result.should.be.an.Array().with.lengthOf(1);
                        result[0].title.should.equal('The Bare Necessities');
                    });
            });

            it('tags.slug NOT equal "classic" and posts_tags.sort_order is 0 and featured is true', function () {
                const mongoJSON = {
                    $and: [
                        {
                            $and: [
                                {
                                    'tags.slug': {
                                        $ne: 'classic'
                                    }
                                },
                                {
                                    'posts_tags.sort_order': 0
                                }
                            ]
                        },
                        {
                            featured: true
                        }
                    ]
                };

                const query = makeQuery(mongoJSON);

                return query
                    .select()
                    .then((result) => {
                        // TODO: should this include tags with no tags? the filter is about primary tag != 'classic' so they should count?
                        result.should.be.an.Array().with.lengthOf(3);
                        result[0].title.should.equal('When She Loved Me');
                        result[1].title.should.equal('no tags, yeah');
                        result[2].title.should.equal('has internal tag');
                    });
            });

            it('tags.slug equals "animal" and posts_tags.sort_order is 0 OR author_id is 1', function () {
                const mongoJSON = {
                    $or: [
                        {
                            $and: [
                                {
                                    'tags.slug': 'animal'
                                },
                                {
                                    'posts_tags.sort_order': 0
                                },
                                {
                                    featured: false
                                }
                            ]
                        },
                        {
                            author_id: 1
                        }
                    ]
                };

                const query = makeQuery(mongoJSON);

                return query
                    .select()
                    .then((result) => {
                        result.should.be.an.Array().with.lengthOf(6);
                    });
            });
        });
    });

    describe.skip('One-to-Many: Extended Cases', function () {
        beforeEach(() => utils.db.init('suite1', 'one-to-many-extended-cases'));
        afterEach(() => utils.db.reset());

        // TODO: should be filled with cases from 'Many-to-Many: Extended Cases' suite
    });

    describe.skip('Many-to-Many: Extended Cases', function () {
        before(() => utils.db.init('suite1', 'many-to-many-extended-cases'));
        after(() => utils.db.reset());

        describe('count', function () {
            it('can compare by count $gt', function () {
                const queryJSON = {
                    'authors.count': {$gt: 0}
                };

                // Use the queryJSON to build a query
                const query = makeQuery(queryJSON);

                // Check any intermediate values
                console.log(query.toQuery());

                // Perform the query against the DB
                return query.select()
                    .then((result) => {
                        console.log(result);

                        result.should.be.an.Array().with.lengthOf(3);

                        // Check we get the right data
                        // result.should.do.something;
                    });
            });

            it('can compare by count $lt', function () {
                const queryJSON = {
                    'authors.count': {$lt: 2}
                };

                // Use the queryJSON to build a query
                const query = makeQuery(queryJSON);

                // Check any intermediate values
                console.log(query.toQuery());

                // Perform the query against the DB
                return query.select()
                    .then((result) => {
                        console.log(result);

                        result.should.be.an.Array().with.lengthOf(3);

                        // Check we get the right data
                        // result.should.do.something;
                    });
            });
        });

        describe('conjunction $and', function () {
            it('can match multiple values of different attributes', function () {
                const queryJSON = {
                    $and: [
                        {'authors.slug': 'pat'},
                        {'tags.slug': 'classic'}
                    ]
                };

                // Use the queryJSON to build a query
                const query = makeQuery(queryJSON);

                // Check any intermediate values
                console.log(query.toQuery());

                // Perform the query against the DB
                return query.select()
                    .then((result) => {
                        console.log(result);

                        result.should.be.an.Array().with.lengthOf(3);

                        // Check we get the right data
                        // result.should.do.something;
                    });
            });
        });

        describe('conjunction $or', function () {
            it('can match values of same attributes', function () {
                const queryJSON = {
                    $or: [
                        {'authors.slug': 'joe'},
                        {'authors.slug': 'pat'}
                    ]
                };

                // Use the queryJSON to build a query
                const query = makeQuery(queryJSON);

                // Check any intermediate values
                console.log(query.toQuery());

                // Perform the query against the DB
                return query.select()
                    .then((result) => {
                        console.log(result);

                        result.should.be.an.Array().with.lengthOf(3);

                        // Check we get the right data
                        // result.should.do.something;
                    });
            });

            it('can match values of different attributes', function () {
                const queryJSON = {
                    $or: [
                        {'authors.slug': 'joe'},
                        {'tags.slug': 'photo'}
                    ]
                };

                // Use the queryJSON to build a query
                const query = makeQuery(queryJSON);

                // Check any intermediate values
                console.log(query.toQuery());

                // Perform the query against the DB
                return query.select()
                    .then((result) => {
                        console.log(result);

                        result.should.be.an.Array().with.lengthOf(3);

                        // Check we get the right data
                        // result.should.do.something;
                    });
            });
        });

        describe('combination of extended cases', function () {
            it('should be filled with a mix of all the above cases', function () {
            });

            it('can match values of different attributes combining with negation', function () {
                const queryJSON = {
                    $or: [
                        {'authors.slug': {$ne: 'joe'}},
                        {'tags.slug': {$in: ['photo']}}
                    ]
                };

                // Use the queryJSON to build a query
                const query = makeQuery(queryJSON);

                // Check any intermediate values
                console.log(query.toQuery());

                // Perform the query against the DB
                return query.select()
                    .then((result) => {
                        console.log(result);

                        result.should.be.an.Array().with.lengthOf(3);

                        // Check we get the right data
                        // result.should.do.something;
                    });
            });
        });
    });
});
