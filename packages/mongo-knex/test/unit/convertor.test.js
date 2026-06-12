require('../utils');
const knex = require('knex')({client: 'mysql2'});
const convertor = require('../../lib/convertor');

const config = {
    relations: {
        tags: {
            tableName: 'tags',
            type: 'manyToMany',
            joinTable: 'posts_tags',
            joinFrom: 'post_id',
            joinTo: 'tag_id'
        },
        optional_tags: {
            tableName: 'optional_tags',
            type: 'manyToMany',
            joinTable: 'posts_tags',
            joinFrom: 'post_id',
            joinTo: 'tag_id',
            joinType: 'leftJoin'
        },
        posts_meta: {
            tableName: 'posts_meta',
            type: 'oneToOne',
            joinFrom: 'post_id'
        },
        tag_count: {
            type: 'aggregate',
            aggregate: {fn: 'count', column: 'posts_tags.tag_id'},
            tableName: 'posts_tags',
            joinFrom: 'post_id'
        },
        public_tag_count: {
            type: 'aggregate',
            aggregate: {fn: 'countDistinct', column: 'posts_tags.tag_id'},
            tableName: 'posts_tags',
            joinFrom: 'post_id',
            joins: [{tableName: 'tags', from: 'id', to: 'tag_id'}],
            wheres: {'tags.visibility': 'public'}
        },
        aliased_public_tag_count: {
            type: 'aggregate',
            aggregate: {fn: 'countDistinct', column: 'pt.tag_id'},
            tableName: 'posts_tags',
            tableNameAs: 'pt',
            joinFrom: 'post_id',
            joins: [{tableName: 'tags', tableNameAs: 't', from: 'id', to: 'tag_id'}],
            wheres: {'t.visibility': 'public'}
        }
    }
};

// Builds the full SQL string - rendering also runs the deferred knex where-callbacks
const runQuery = query => convertor(knex('posts'), query, config).toQuery();

// Builds the query object without rendering it, like consumers do before executing
const buildQuery = query => convertor(knex('posts'), query, config);

describe('Simple Expressions', function () {
    it('should match based on simple id', function () {
        runQuery({id: 3})
            .should.eql('select * from `posts` where `posts`.`id` = 3');
    });

    it('should match based on string', function () {
        runQuery({title: 'Second post'})
            .should.eql('select * from `posts` where `posts`.`title` = \'Second post\'');
    });

    it('should accept any table input and interprets it as destination where clause', function () {
        runQuery({'posts.title': 'Second post'})
            .should.eql('select * from `posts` where `posts`.`title` = \'Second post\'');
    });

    it('should accept any table input and interprets it as destination where clause (number)', function () {
        runQuery({'count.posts': '3'})
            .should.eql('select * from `posts` where `count`.`posts` = \'3\'');
    });
});

describe('Comparison Query Operators', function () {
    it('can match equals', function () {
        runQuery({id: 2})
            .should.eql('select * from `posts` where `posts`.`id` = 2');
    });

    it('can match not equals', function () {
        runQuery({id: {$ne: 2}})
            .should.eql('select * from `posts` where `posts`.`id` != 2');
    });

    it('can match gt', function () {
        runQuery({id: {$gt: 2}})
            .should.eql('select * from `posts` where `posts`.`id` > 2');
    });

    it('can match lt', function () {
        runQuery({id: {$lt: 2}})
            .should.eql('select * from `posts` where `posts`.`id` < 2');
    });

    it('can match gte', function () {
        runQuery({id: {$gte: 2}})
            .should.eql('select * from `posts` where `posts`.`id` >= 2');
    });

    it('can match lte', function () {
        runQuery({id: {$lte: 2}})
            .should.eql('select * from `posts` where `posts`.`id` <= 2');
    });

    it('can match simple in (single value)', function () {
        runQuery({id: {$in: [2]}})
            .should.eql('select * from `posts` where `posts`.`id` in (2)');
    });

    it('can match simple in (multiple values)', function () {
        runQuery({id: {$in: [1, 3]}})
            .should.eql('select * from `posts` where `posts`.`id` in (1, 3)');
    });

    it('can match simple NOT in (single value)', function () {
        runQuery({id: {$nin: [2]}})
            .should.eql('select * from `posts` where `posts`.`id` not in (2)');
    });

    it('can match simple NOT in (multiple values)', function () {
        runQuery({id: {$nin: [1, 3]}})
            .should.eql('select * from `posts` where `posts`.`id` not in (1, 3)');
    });

    it('can match array in (single value)', function () {
        runQuery({tags: {$in: ['video']}})
            .should.eql('select * from `posts` where `posts`.`tags` in (\'video\')');
    });

    it('can match array in (multiple values)', function () {
        runQuery({tags: {$in: ['video', 'audio']}})
            .should.eql('select * from `posts` where `posts`.`tags` in (\'video\', \'audio\')');
    });

    it('can match array NOT in (single value)', function () {
        runQuery({tags: {$nin: ['video']}})
            .should.eql('select * from `posts` where `posts`.`tags` not in (\'video\')');
    });

    it('can match array NOT in (multiple values)', function () {
        runQuery({tags: {$nin: ['video', 'audio']}})
            .should.eql('select * from `posts` where `posts`.`tags` not in (\'video\', \'audio\')');
    });

    it('can match like', function () {
        runQuery({email: {$regex: /Gmail\.com/i}})
            .should.eql('select * from `posts` where lower(`posts`.`email`) like \'%gmail.com%\' ESCAPE \'*\'');
    });

    it('can match like with startswith', function () {
        runQuery({email: {$regex: /^Gmail\.com/i}})
            .should.eql('select * from `posts` where lower(`posts`.`email`) like \'gmail.com%\' ESCAPE \'*\'');
    });

    it('can match like with startswith containing a slash', function () {
        runQuery({email: {$regex: /^https:\/\/www.google.com\//i}})
            .should.eql('select * from `posts` where lower(`posts`.`email`) like \'https://www.google.com/%\' ESCAPE \'*\'');
    });

    it('can match like with endswith', function () {
        runQuery({email: {$regex: /Gmail\.com$/i}})
            .should.eql('select * from `posts` where lower(`posts`.`email`) like \'%gmail.com\' ESCAPE \'*\'');
    });

    // % and _ don't have a meaning in regexes, but they do in LIKE, so they should be escaped in the resulting query
    it('correctly escapes _ LIKE special character', function () {
        // Get all posts that contain __GHOST_URL__
        // Since _ is a special character in LIKE, we need to escape it with * (our chosen escape character)
        runQuery({url: {$regex: /__GHOST_URL__/}})
            .should.eql('select * from `posts` where `posts`.`url` like \'%*_*_GHOST*_URL*_*_%\' ESCAPE \'*\'');
    });

    it('correctly escapes % LIKE special character', function () {
        // Get all posts with titles that contain '100%'
        // Since % is a special character in LIKE, we need to escape it with * (our chosen escape character)
        runQuery({title: {$regex: /100%/}})
            .should.eql('select * from `posts` where `posts`.`title` like \'%100*%%\' ESCAPE \'*\'');
    });

    it('correctly escapes * LIKE escape character', function () {
        // Get all posts with titles that contain '*'
        // Since * is the escape character, we need to escape it with itself
        runQuery({title: {$regex: /\*/}})
            .should.eql('select * from `posts` where `posts`.`title` like \'%**%\' ESCAPE \'*\'');
    });
});

describe('Logical Query Operators', function () {
    it('$and (different properties)', function () {
        runQuery({$and: [{featured: false}, {status: 'published'}]})
            .should.eql('select * from `posts` where (`posts`.`featured` = false and `posts`.`status` = \'published\')');
    });

    it('$and (same properties)', function () {
        runQuery({$and: [{featured: false}, {featured: true}]})
            .should.eql('select * from `posts` where (`posts`.`featured` = false and `posts`.`featured` = true)');
    });

    it('$or (different properties)', function () {
        runQuery({$or: [{featured: false}, {status: 'published'}]})
            .should.eql('select * from `posts` where (`posts`.`featured` = false or `posts`.`status` = \'published\')');
    });

    it('$or (same properties)', function () {
        runQuery({$or: [{featured: true}, {featured: false}]})
            .should.eql('select * from `posts` where (`posts`.`featured` = true or `posts`.`featured` = false)');
    });
});

describe('Logical Groups', function () {
    describe('$or', function () {
        it('ungrouped version', function () {
            runQuery({
                $or:
                    [{author: {$ne: 'joe'}},
                        {tags: {$in: ['photo']}},
                        {image: {$ne: null}},
                        {featured: true}]
            })
                .should.eql('select * from `posts` where (`posts`.`author` != \'joe\' or `posts`.`tags` in (\'photo\') or `posts`.`image` is not null or `posts`.`featured` = true)');
        });

        it('RIGHT grouped version', function () {
            runQuery({
                $or:
                    [{author: {$ne: 'joe'}},
                        {
                            $or:
                                [{tags: {$in: ['photo']}},
                                    {image: {$ne: null}},
                                    {featured: true}]
                        }]
            })
                .should.eql('select * from `posts` where (`posts`.`author` != \'joe\' or (`posts`.`tags` in (\'photo\') or `posts`.`image` is not null or `posts`.`featured` = true))');
        });

        it('LEFT grouped version', function () {
            runQuery({
                $or:
                    [{
                        $or:
                            [
                                {tags: {$in: ['photo']}},
                                {image: {$ne: null}},
                                {featured: true}]
                    },
                    {author: {$ne: 'joe'}}]
            })
                .should.eql('select * from `posts` where ((`posts`.`tags` in (\'photo\') or `posts`.`image` is not null or `posts`.`featured` = true) or `posts`.`author` != \'joe\')');
        });
    });

    describe('$and', function () {
        it('ungrouped version', function () {
            runQuery({
                $and:
                    [{author: {$ne: 'joe'}},
                        {tags: {$in: ['photo']}},
                        {image: {$ne: null}},
                        {featured: true}]
            })
                .should.eql('select * from `posts` where (`posts`.`author` != \'joe\' and `posts`.`tags` in (\'photo\') and `posts`.`image` is not null and `posts`.`featured` = true)');
        });

        it('RIGHT grouped version', function () {
            runQuery({
                $and:
                    [{author: {$ne: 'joe'}},
                        {
                            $and:
                                [{tags: {$in: ['photo']}},
                                    {image: {$ne: null}},
                                    {featured: true}]
                        }]
            })
                .should.eql('select * from `posts` where (`posts`.`author` != \'joe\' and (`posts`.`tags` in (\'photo\') and `posts`.`image` is not null and `posts`.`featured` = true))');
        });

        it('LEFT grouped version', function () {
            runQuery({
                $and:
                    [{
                        $and:
                            [{tags: {$in: ['photo']}},
                                {image: {$ne: null}},
                                {featured: true}]
                    },
                    {author: {$ne: 'joe'}}]
            })
                .should.eql('select * from `posts` where ((`posts`.`tags` in (\'photo\') and `posts`.`image` is not null and `posts`.`featured` = true) and `posts`.`author` != \'joe\')');
        });
    });

    describe('$or with $and group', function () {
        it('ungrouped version', function () {
            runQuery({
                $or:
                    [{author: {$ne: 'joe'}},
                        {
                            $and:
                                [{tags: {$in: ['photo']}},
                                    {image: {$ne: null}},
                                    {featured: true}]
                        }]
            })
                .should.eql('select * from `posts` where (`posts`.`author` != \'joe\' or (`posts`.`tags` in (\'photo\') and `posts`.`image` is not null and `posts`.`featured` = true))');
        });

        it('RIGHT grouped version', function () {
            runQuery({
                $or:
                    [{author: {$ne: 'joe'}},
                        {
                            $and:
                                [{tags: {$in: ['photo']}},
                                    {image: {$ne: null}},
                                    {featured: true}]
                        }]
            })
                .should.eql('select * from `posts` where (`posts`.`author` != \'joe\' or (`posts`.`tags` in (\'photo\') and `posts`.`image` is not null and `posts`.`featured` = true))');
        });

        it('LEFT grouped version', function () {
            runQuery({
                $or:
                    [{
                        $and:
                            [{tags: {$in: ['photo']}},
                                {image: {$ne: null}},
                                {featured: true}]
                    },
                    {author: {$ne: 'joe'}}]
            })
                .should.eql('select * from `posts` where ((`posts`.`tags` in (\'photo\') and `posts`.`image` is not null and `posts`.`featured` = true) or `posts`.`author` != \'joe\')');
        });
    });

    describe('$and with $or group', function () {
        it('ungrouped version', function () {
            runQuery({
                $or:
                    [{
                        $and:
                            [{author: {$ne: 'joe'}},
                                {tags: {$in: ['photo']}}]
                    },
                    {image: {$ne: null}},
                    {featured: true}]
            })
                .should.eql('select * from `posts` where ((`posts`.`author` != \'joe\' and `posts`.`tags` in (\'photo\')) or `posts`.`image` is not null or `posts`.`featured` = true)');
        });

        it('RIGHT grouped version', function () {
            runQuery({
                $and:
                    [{author: {$ne: 'joe'}},
                        {
                            $or:
                                [{tags: {$in: ['photo']}},
                                    {image: {$ne: null}},
                                    {featured: true}]
                        }]
            })
                .should.eql('select * from `posts` where (`posts`.`author` != \'joe\' and (`posts`.`tags` in (\'photo\') or `posts`.`image` is not null or `posts`.`featured` = true))');
        });

        it('LEFT grouped version', function () {
            runQuery({
                $and:
                    [{
                        $or:
                            [{tags: {$in: ['photo']}},
                                {image: {$ne: null}},
                                {featured: true}]
                    },
                    {author: {$ne: 'joe'}}]
            })
                .should.eql('select * from `posts` where ((`posts`.`tags` in (\'photo\') or `posts`.`image` is not null or `posts`.`featured` = true) and `posts`.`author` != \'joe\')');
        });
    });
});

describe('Relations', function () {
    it('should be able to perform query on a many-to-many relation', function () {
        runQuery({'tags.slug': 'fred'})
            .should.eql('select * from `posts` where `posts`.`id` in (select `posts_tags`.`post_id` from `posts_tags` inner join `tags` on `tags`.`id` = `posts_tags`.`tag_id` where `tags`.`slug` = \'fred\')');
    });

    it('should be able to perform NULL query on a many-to-many relation', function () {
        runQuery({'tags.slug': null})
            .should.eql('select * from `posts` where `posts`.`id` in (select `posts_tags`.`post_id` from `posts_tags` inner join `tags` on `tags`.`id` = `posts_tags`.`tag_id` where `tags`.`slug` is null)');
    });

    it('should be able to perform NULL query on a many-to-many relation with left join', function () {
        runQuery({'optional_tags.slug': null})
            .should.eql('select * from `posts` where `posts`.`id` in (select `posts_tags`.`post_id` from `posts_tags` left join `optional_tags` on `optional_tags`.`id` = `posts_tags`.`tag_id` where `optional_tags`.`slug` is null)');
    });

    it('should be able to perform a negated query on a many-to-many relation (works but is weird)', function () {
        runQuery({'tags.slug': {$ne: 'fred'}})
            .should.eql('select * from `posts` where `posts`.`id` not in (select `posts_tags`.`post_id` from `posts_tags` inner join `tags` on `tags`.`id` = `posts_tags`.`tag_id` where `tags`.`slug` in (\'fred\'))');
    });

    // This case doesn't work
    it.skip('should be able to perform a query on a many-to-many join table alone', function () {
        runQuery({'posts_tags.sort_order': 0});
    });

    it('should be able to perform a query on a many-to-many join table and its relation', function () {
        runQuery({
            $and: [
                {
                    'tags.slug': 'cgi'
                },
                {
                    'posts_tags.sort_order': 0
                }
            ]
        })
            .should.eql('select * from `posts` where (`posts`.`id` in (select `posts_tags`.`post_id` from `posts_tags` inner join `tags` on `tags`.`id` = `posts_tags`.`tag_id` and `posts_tags`.`sort_order` = 0 where `tags`.`slug` = \'cgi\'))');
    });

    it('should keep same-column range conditions in a single many-to-many subquery', function () {
        runQuery({
            $and: [
                {
                    'tags.created_at': {$gte: '2015-01-01'}
                },
                {
                    'tags.created_at': {$lte: '2015-12-31'}
                }
            ]
        })
            .should.eql('select * from `posts` where (`posts`.`id` in (select `posts_tags`.`post_id` from `posts_tags` inner join `tags` on `tags`.`id` = `posts_tags`.`tag_id` where `tags`.`created_at` >= \'2015-01-01\' and `tags`.`created_at` <= \'2015-12-31\'))');
    });

    it('should split same-column equality conditions into separate many-to-many subqueries', function () {
        runQuery({
            $and: [
                {
                    'tags.slug': 'animal'
                },
                {
                    'tags.slug': 'classic'
                }
            ]
        })
            .should.eql('select * from `posts` where (`posts`.`id` in (select `posts_tags`.`post_id` from `posts_tags` inner join `tags` on `tags`.`id` = `posts_tags`.`tag_id` where `tags`.`slug` = \'animal\') and `posts`.`id` in (select `posts_tags`.`post_id` from `posts_tags` inner join `tags` on `tags`.`id` = `posts_tags`.`tag_id` where `tags`.`slug` = \'classic\'))');
    });

    it('should be able to perform a query on a one-to-one relation', function () {
        runQuery({'posts_meta.meta_title': 'Meta of A Whole New World'})
            .should.eql('select * from `posts` where `posts`.`id` in (select `posts`.`id` from `posts` left join `posts_meta` on `posts_meta`.`post_id` = `posts`.`id` where `posts_meta`.`meta_title` = \'Meta of A Whole New World\')');
    });

    it('should be able to perform a negated query on a one-to-one relation (works but is weird)', function () {
        runQuery({'posts_meta.meta_title': {$ne: 'Meta of A Whole New World'}})
            .should.eql('select * from `posts` where `posts`.`id` not in (select `posts`.`id` from `posts` left join `posts_meta` on `posts_meta`.`post_id` = `posts`.`id` where `posts_meta`.`meta_title` in (\'Meta of A Whole New World\'))');
    });
});

describe('Aggregate Relations', function () {
    describe('operators not matching a zero aggregate use IN + HAVING as stated', function () {
        it('$eq with a non-zero value', function () {
            runQuery({tag_count: 2})
                .should.eql('select * from `posts` where `posts`.`id` in (select `posts_tags`.`post_id` from `posts_tags` group by `posts_tags`.`post_id` having count(`posts_tags`.`tag_id`) = 2)');
        });

        it('$ne 0', function () {
            runQuery({tag_count: {$ne: 0}})
                .should.eql('select * from `posts` where `posts`.`id` in (select `posts_tags`.`post_id` from `posts_tags` group by `posts_tags`.`post_id` having count(`posts_tags`.`tag_id`) != 0)');
        });

        it('$gt', function () {
            runQuery({tag_count: {$gt: 1}})
                .should.eql('select * from `posts` where `posts`.`id` in (select `posts_tags`.`post_id` from `posts_tags` group by `posts_tags`.`post_id` having count(`posts_tags`.`tag_id`) > 1)');
        });

        it('$gte with a non-zero value', function () {
            runQuery({tag_count: {$gte: 1}})
                .should.eql('select * from `posts` where `posts`.`id` in (select `posts_tags`.`post_id` from `posts_tags` group by `posts_tags`.`post_id` having count(`posts_tags`.`tag_id`) >= 1)');
        });

        it('$in without zero', function () {
            runQuery({tag_count: {$in: [1, 2]}})
                .should.eql('select * from `posts` where `posts`.`id` in (select `posts_tags`.`post_id` from `posts_tags` group by `posts_tags`.`post_id` having count(`posts_tags`.`tag_id`) in (1, 2))');
        });

        it('$nin containing zero', function () {
            runQuery({tag_count: {$nin: [0]}})
                .should.eql('select * from `posts` where `posts`.`id` in (select `posts_tags`.`post_id` from `posts_tags` group by `posts_tags`.`post_id` having count(`posts_tags`.`tag_id`) not in (0))');
        });
    });

    describe('operators matching a zero aggregate are inverted to NOT IN + complement HAVING', function () {
        it('$eq 0', function () {
            runQuery({tag_count: 0})
                .should.eql('select * from `posts` where `posts`.`id` not in (select `posts_tags`.`post_id` from `posts_tags` where `posts_tags`.`post_id` is not null group by `posts_tags`.`post_id` having count(`posts_tags`.`tag_id`) != 0)');
        });

        it('$ne with a non-zero value', function () {
            runQuery({tag_count: {$ne: 1}})
                .should.eql('select * from `posts` where `posts`.`id` not in (select `posts_tags`.`post_id` from `posts_tags` where `posts_tags`.`post_id` is not null group by `posts_tags`.`post_id` having count(`posts_tags`.`tag_id`) = 1)');
        });

        it('$lt', function () {
            runQuery({tag_count: {$lt: 2}})
                .should.eql('select * from `posts` where `posts`.`id` not in (select `posts_tags`.`post_id` from `posts_tags` where `posts_tags`.`post_id` is not null group by `posts_tags`.`post_id` having count(`posts_tags`.`tag_id`) >= 2)');
        });

        it('$lte 0', function () {
            runQuery({tag_count: {$lte: 0}})
                .should.eql('select * from `posts` where `posts`.`id` not in (select `posts_tags`.`post_id` from `posts_tags` where `posts_tags`.`post_id` is not null group by `posts_tags`.`post_id` having count(`posts_tags`.`tag_id`) > 0)');
        });

        it('$gte 0 (matches everything)', function () {
            runQuery({tag_count: {$gte: 0}})
                .should.eql('select * from `posts` where `posts`.`id` not in (select `posts_tags`.`post_id` from `posts_tags` where `posts_tags`.`post_id` is not null group by `posts_tags`.`post_id` having count(`posts_tags`.`tag_id`) < 0)');
        });

        it('$in containing zero', function () {
            runQuery({tag_count: {$in: [0, 2]}})
                .should.eql('select * from `posts` where `posts`.`id` not in (select `posts_tags`.`post_id` from `posts_tags` where `posts_tags`.`post_id` is not null group by `posts_tags`.`post_id` having count(`posts_tags`.`tag_id`) not in (0, 2))');
        });

        it('$nin without zero', function () {
            runQuery({tag_count: {$nin: [1]}})
                .should.eql('select * from `posts` where `posts`.`id` not in (select `posts_tags`.`post_id` from `posts_tags` where `posts_tags`.`post_id` is not null group by `posts_tags`.`post_id` having count(`posts_tags`.`tag_id`) in (1))');
        });
    });

    describe('grouping', function () {
        it('combines $and range conditions on the same aggregate into a single subquery', function () {
            runQuery({$and: [{tag_count: {$gt: 1}}, {tag_count: {$lt: 5}}]})
                .should.eql('select * from `posts` where (`posts`.`id` in (select `posts_tags`.`post_id` from `posts_tags` group by `posts_tags`.`post_id` having count(`posts_tags`.`tag_id`) > 1 and count(`posts_tags`.`tag_id`) < 5))');
        });

        it('inverts an $or range group matching zero, flipping the HAVING conjunction (De Morgan)', function () {
            runQuery({$or: [{tag_count: {$lt: 1}}, {tag_count: {$gt: 1}}]})
                .should.eql('select * from `posts` where (`posts`.`id` not in (select `posts_tags`.`post_id` from `posts_tags` where `posts_tags`.`post_id` is not null group by `posts_tags`.`post_id` having count(`posts_tags`.`tag_id`) >= 1 and count(`posts_tags`.`tag_id`) <= 1))');
        });

        it('combines mixed-direction $or statements into a single inverted subquery', function () {
            runQuery({$or: [{tag_count: 0}, {tag_count: {$gt: 5}}]})
                .should.eql('select * from `posts` where (`posts`.`id` not in (select `posts_tags`.`post_id` from `posts_tags` where `posts_tags`.`post_id` is not null group by `posts_tags`.`post_id` having count(`posts_tags`.`tag_id`) != 0 and count(`posts_tags`.`tag_id`) <= 5))');
        });

        it('combines negated and regular conditions on the same aggregate into a single subquery', function () {
            runQuery({$and: [{tag_count: {$ne: 1}}, {tag_count: {$gt: 0}}]})
                .should.eql('select * from `posts` where (`posts`.`id` in (select `posts_tags`.`post_id` from `posts_tags` group by `posts_tags`.`post_id` having count(`posts_tags`.`tag_id`) != 1 and count(`posts_tags`.`tag_id`) > 0))');
        });

        it('combines multiple negated conditions into a single inverted subquery', function () {
            runQuery({$and: [{tag_count: {$ne: 1}}, {tag_count: {$ne: 3}}]})
                .should.eql('select * from `posts` where (`posts`.`id` not in (select `posts_tags`.`post_id` from `posts_tags` where `posts_tags`.`post_id` is not null group by `posts_tags`.`post_id` having count(`posts_tags`.`tag_id`) = 1 or count(`posts_tags`.`tag_id`) = 3))');
        });
    });

    describe('combining with other filters', function () {
        it('with a plain column in an $or group', function () {
            runQuery({$or: [{status: 'draft'}, {tag_count: {$gt: 1}}]})
                .should.eql('select * from `posts` where (`posts`.`status` = \'draft\' or `posts`.`id` in (select `posts_tags`.`post_id` from `posts_tags` group by `posts_tags`.`post_id` having count(`posts_tags`.`tag_id`) > 1))');
        });

        it('with a many-to-many relation in an $and group', function () {
            runQuery({$and: [{'tags.slug': 'animal'}, {tag_count: {$gt: 1}}]})
                .should.eql('select * from `posts` where (`posts`.`id` in (select `posts_tags`.`post_id` from `posts_tags` inner join `tags` on `tags`.`id` = `posts_tags`.`tag_id` where `tags`.`slug` = \'animal\') and `posts`.`id` in (select `posts_tags`.`post_id` from `posts_tags` group by `posts_tags`.`post_id` having count(`posts_tags`.`tag_id`) > 1))');
        });

        it('with a one-to-one relation in an $and group', function () {
            runQuery({$and: [{'posts_meta.like_count': 42}, {tag_count: {$gt: 1}}]})
                .should.eql('select * from `posts` where (`posts`.`id` in (select `posts`.`id` from `posts` left join `posts_meta` on `posts_meta`.`post_id` = `posts`.`id` where `posts_meta`.`like_count` = 42) and `posts`.`id` in (select `posts_tags`.`post_id` from `posts_tags` group by `posts_tags`.`post_id` having count(`posts_tags`.`tag_id`) > 1))');
        });

        it('with a join table filter in an $and group, restricting the aggregated rows', function () {
            runQuery({$and: [{'posts_tags.sort_order': 0}, {tag_count: {$gt: 1}}]})
                .should.eql('select * from `posts` where (`posts`.`id` in (select `posts_tags`.`post_id` from `posts_tags` where `posts_tags`.`sort_order` = 0 group by `posts_tags`.`post_id` having count(`posts_tags`.`tag_id`) > 1))');
        });

        it('with a join table filter in an inverted $and group', function () {
            runQuery({$and: [{'posts_tags.sort_order': 0}, {tag_count: 0}]})
                .should.eql('select * from `posts` where (`posts`.`id` not in (select `posts_tags`.`post_id` from `posts_tags` where `posts_tags`.`post_id` is not null and `posts_tags`.`sort_order` = 0 group by `posts_tags`.`post_id` having count(`posts_tags`.`tag_id`) != 0))');
        });
    });

    describe('config-driven joins and wheres', function () {
        it('applies the configured join chain and fixed wheres inside the subquery', function () {
            runQuery({public_tag_count: {$gt: 1}})
                .should.eql('select * from `posts` where `posts`.`id` in (select `posts_tags`.`post_id` from `posts_tags` inner join `tags` on `tags`.`id` = `posts_tags`.`tag_id` where `tags`.`visibility` = \'public\' group by `posts_tags`.`post_id` having count(distinct `posts_tags`.`tag_id`) > 1)');
        });

        it('keeps the configured join chain and fixed wheres when inverted', function () {
            runQuery({public_tag_count: 0})
                .should.eql('select * from `posts` where `posts`.`id` not in (select `posts_tags`.`post_id` from `posts_tags` inner join `tags` on `tags`.`id` = `posts_tags`.`tag_id` where `posts_tags`.`post_id` is not null and `tags`.`visibility` = \'public\' group by `posts_tags`.`post_id` having count(distinct `posts_tags`.`tag_id`) != 0)');
        });

        it('aliases the aggregated table and joined tables via tableNameAs', function () {
            runQuery({aliased_public_tag_count: {$gt: 1}})
                .should.eql('select * from `posts` where `posts`.`id` in (select `pt`.`post_id` from `posts_tags` as `pt` inner join `tags` as `t` on `t`.`id` = `pt`.`tag_id` where `t`.`visibility` = \'public\' group by `pt`.`post_id` having count(distinct `pt`.`tag_id`) > 1)');
        });

        it('keeps aliases when inverted', function () {
            runQuery({aliased_public_tag_count: 0})
                .should.eql('select * from `posts` where `posts`.`id` not in (select `pt`.`post_id` from `posts_tags` as `pt` inner join `tags` as `t` on `t`.`id` = `pt`.`tag_id` where `pt`.`post_id` is not null and `t`.`visibility` = \'public\' group by `pt`.`post_id` having count(distinct `pt`.`tag_id`) != 0)');
        });
    });

    describe('guards', function () {
        const expectedError = 'Aggregate relation "tag_count" only supports $eq, $ne, $gt, $gte, $lt, $lte, $in, $nin comparisons with numeric values';

        it('throws on operators that make no sense for aggregates', function () {
            (function () {
                runQuery({tag_count: {$regex: /x/}});
            }).should.throw(expectedError);
        });

        it('throws on unknown operators instead of silently dropping the filter', function () {
            (function () {
                runQuery({tag_count: {$foo: 1}});
            }).should.throw(expectedError);
        });

        it('throws on unknown operators inside an $and group', function () {
            (function () {
                runQuery({$and: [{status: 'draft'}, {tag_count: {$foo: 1}}]});
            }).should.throw(expectedError);
        });

        it('throws on unknown operators inside an $or group', function () {
            (function () {
                runQuery({$or: [{status: 'draft'}, {tag_count: {$foo: 1}}]});
            }).should.throw(expectedError);
        });

        it('throws on array values for scalar operators instead of generating invalid SQL', function () {
            (function () {
                runQuery({tag_count: {$gt: [1, 2]}});
            }).should.throw(expectedError);
        });

        it('throws on an empty array value for scalar operators instead of generating invalid SQL', function () {
            (function () {
                runQuery({tag_count: {$eq: []}});
            }).should.throw(expectedError);
        });

        it('throws on null values', function () {
            (function () {
                runQuery({tag_count: null});
            }).should.throw(expectedError);
        });

        it('throws on non-numeric values whose database coercion would disagree with the inversion decision', function () {
            (function () {
                runQuery({tag_count: {$lt: '2abc'}});
            }).should.throw(expectedError);
        });

        it('throws on arrays containing non-numeric values', function () {
            (function () {
                runQuery({tag_count: {$in: [null, 2]}});
            }).should.throw(expectedError);
        });

        it('throws when a valid statement shares a group with an invalid one, instead of dropping both', function () {
            (function () {
                runQuery({$or: [{tag_count: {$gt: 1}}, {tag_count: {$regex: /x/}}]});
            }).should.throw(expectedError);
        });

        it('accepts numeric strings', function () {
            runQuery({tag_count: {$gt: '1'}})
                .should.eql('select * from `posts` where `posts`.`id` in (select `posts_tags`.`post_id` from `posts_tags` group by `posts_tags`.`post_id` having count(`posts_tags`.`tag_id`) > \'1\')');
        });

        it('empty $in matches nothing instead of generating invalid SQL', function () {
            runQuery({tag_count: {$in: []}})
                .should.eql('select * from `posts` where `posts`.`id` in (select `posts_tags`.`post_id` from `posts_tags` group by `posts_tags`.`post_id` having 1 = 0)');
        });

        it('empty $nin matches everything instead of generating invalid SQL', function () {
            runQuery({tag_count: {$nin: []}})
                .should.eql('select * from `posts` where `posts`.`id` not in (select `posts_tags`.`post_id` from `posts_tags` where `posts_tags`.`post_id` is not null group by `posts_tags`.`post_id` having 1 = 0)');
        });

        it('throws on a dotted column suffix, every suffix would alias the same query', function () {
            (function () {
                runQuery({'tag_count.count': {$gt: 1}});
            }).should.throw('Aggregate relation "tag_count" is queried by name only, without a column (e.g. "tag_count:0")');
        });

        describe('throws while building the query, not while rendering it', function () {
            // Grouped statements are compiled inside knex where-callbacks, which only
            // run once the query is rendered - validation must not wait for that, or
            // the error escapes the error handling wrapped around the query build
            // (e.g. the layer turning invalid filters into 4xx responses)
            it('for an invalid value inside an $and group', function () {
                (function () {
                    buildQuery({$and: [{status: 'draft'}, {tag_count: null}]});
                }).should.throw(expectedError);
            });

            it('for an unknown operator inside an $or group', function () {
                (function () {
                    buildQuery({$or: [{status: 'draft'}, {tag_count: {$foo: 1}}]});
                }).should.throw(expectedError);
            });

            it('for an invalid value inside a nested group', function () {
                (function () {
                    buildQuery({$and: [{status: 'draft'}, {$or: [{featured: true}, {tag_count: 'abc'}]}]});
                }).should.throw(expectedError);
            });

            it('for a dotted column suffix inside an $and group', function () {
                (function () {
                    buildQuery({$and: [{status: 'draft'}, {'tag_count.count': {$gt: 1}}]});
                }).should.throw('Aggregate relation "tag_count" is queried by name only, without a column (e.g. "tag_count:0")');
            });
        });

        it('throws on a missing aggregate config', function () {
            (function () {
                convertor(knex('posts'), {bad_count: 1}, {
                    relations: {
                        bad_count: {
                            type: 'aggregate',
                            tableName: 'posts_tags',
                            joinFrom: 'post_id'
                        }
                    }
                }).toQuery();
            }).should.throw('Aggregate relations require an aggregate config with fn and column');
        });

        it('throws when aggregate.fn is missing', function () {
            (function () {
                convertor(knex('posts'), {bad_count: 1}, {
                    relations: {
                        bad_count: {
                            type: 'aggregate',
                            aggregate: {column: 'posts_tags.tag_id'},
                            tableName: 'posts_tags',
                            joinFrom: 'post_id'
                        }
                    }
                }).toQuery();
            }).should.throw('Aggregate relations require an aggregate config with fn and column');
        });

        it('throws when aggregate.column is missing', function () {
            (function () {
                convertor(knex('posts'), {bad_count: 1}, {
                    relations: {
                        bad_count: {
                            type: 'aggregate',
                            aggregate: {fn: 'count'},
                            tableName: 'posts_tags',
                            joinFrom: 'post_id'
                        }
                    }
                }).toQuery();
            }).should.throw('Aggregate relations require an aggregate config with fn and column');
        });

        it('throws on an unknown aggregate function', function () {
            (function () {
                convertor(knex('posts'), {bad_count: 1}, {
                    relations: {
                        bad_count: {
                            type: 'aggregate',
                            aggregate: {fn: 'explode', column: 'posts_tags.tag_id'},
                            tableName: 'posts_tags',
                            joinFrom: 'post_id'
                        }
                    }
                }).toQuery();
            }).should.throw('Unknown aggregate function: explode');
        });
    });
});

describe('RegExp/Like queries', function () {
    it('are well behaved', function () {
        runQuery({title: {$regex: /'/i}})
            .should.eql('select * from `posts` where lower(`posts`.`title`) like \'%\\\'%\' ESCAPE \'*\'');

        runQuery({title: {$regex: /;/i}})
            .should.eql('select * from `posts` where lower(`posts`.`title`) like \'%;%\' ESCAPE \'*\'');

        runQuery({title: {$regex: /';select * from `settings` where `value` like '/i}})
            .should.eql('select * from `posts` where lower(`posts`.`title`) like \'%\\\';select ** from `settings` where `value` like \\\'%\' ESCAPE \'*\'');
    });
});
