const utils = require('../utils');
const nql = require('../../lib/nql');

const knex = utils.db.client;

/**
 * The purpose of this file is to prove that NQL
 * is not just transformed to mongo queries correctly
 * but that this can be used in real world settings to query SQL databases
 */

describe('Integration with Knex', function () {
    before(utils.db.setup());
    after(utils.db.teardown());

    it('should match based on simple id', function () {
        const query = nql('featured:true');

        return query
            .querySQL(knex('posts'))
            .select()
            .then((result) => {
                result.should.be.an.Array().with.lengthOf(4);
                result[0].featured.should.equal(1);
            });
    });

    describe('ALL OF (has-all) relation queries', function () {
        const relationConfig = {
            relations: {
                tags: {
                    tableName: 'tags',
                    type: 'manyToMany',
                    joinTable: 'posts_tags',
                    joinFrom: 'post_id',
                    joinTo: 'tag_id'
                }
            }
        };

        const toSQL = filter => nql(filter, relationConfig)
            .querySQL(knex('posts'))
            .toQuery();

        it('turns `[a+b]` into a separate ANDed subquery per value (has all)', function () {
            const sql = toSQL('tags.slug:[animal+classic]');

            // one `in (select ...)` per value, ANDed together
            sql.match(/in \(select/g).should.have.lengthOf(2);
            sql.should.match(/`tags`\.`slug` = 'animal'/);
            sql.should.match(/`tags`\.`slug` = 'classic'/);
            sql.should.match(/\) and `posts`\.`id` in \(select/);
        });

        it('keeps `[a,b]` as a single IN subquery (has any)', function () {
            const sql = toSQL('tags.slug:[animal,classic]');

            sql.match(/in \(select/g).should.have.lengthOf(1);
            sql.should.match(/`tags`\.`slug` in \('animal', 'classic'\)/);
        });
    });

    describe('Regex / Like queries', function () {
        it('can do a contains query', function () {
            const query = nql(`title:~'ne'`);

            return query
                .querySQL(knex('posts'))
                .select()
                .then((result) => {
                    result.should.be.an.Array().with.lengthOf(2);
                    result[0].title.should.equal('A Whole New World');
                    result[1].title.should.equal('The Bare Necessities');
                });
        });

        it('can do a startswith query', function () {
            const query = nql(`title:~^'wh'`);

            return query
                .querySQL(knex('posts'))
                .select()
                .then((result) => {
                    result.should.be.an.Array().with.lengthOf(1);
                    result[0].title.should.equal('When She Loved Me');
                });
        });

        it('can do an endswith query', function () {
            const query = nql(`title:~$'es'`);

            return query
                .querySQL(knex('posts'))
                .select()
                .then((result) => {
                    result.should.be.an.Array().with.lengthOf(1);
                    result[0].title.should.equal('The Bare Necessities');
                });
        });
    });
});
