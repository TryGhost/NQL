const Promise = require('bluebird');

module.exports.up = function (knex) {
    // Before all tests, we load any base data (data that won't change)
    return knex
        .schema.createTable('posts', (table) => {
            table.increments('id').primary();
            table.string('title', 191).defaultTo('(Untitled)');
            table.boolean('featured').defaultsTo(false);
            table.string('image', 191).nullable();
            table.string('status', 191).nullable();
            table.integer('author_id').references('authors.id');
        })
        .then(() => knex.schema.createTable('tags', (table) => {
            table.increments('id').primary();
            table.string('name', 191);
            table.string('slug', 191);
            table.string('visibility', 191).defaultTo('public');
        }))
        .then(() => knex.schema.createTable('authors', (table) => {
            table.increments('id').primary();
            table.string('name', 191);
            table.string('slug', 191);
        }))
        .then(() => knex.schema.createTable('posts_tags', (table) => {
            table.increments('id').primary();
            table.integer('post_id').references('posts.id');
            table.integer('tag_id').references('tags.id');
            table.integer('sort_order').defaultTo(0);
        }));
};

module.exports.down = function (knex) {
    const tables = ['posts_tags', 'posts', 'tags', 'authors'];

    return Promise.each(tables, table => knex.schema.dropTableIfExists(table));
};
