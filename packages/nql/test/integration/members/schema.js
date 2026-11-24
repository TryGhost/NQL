const Promise = require('bluebird');

// The tables behind Ghost's member filter relations, cut down to the columns the tests use
const TABLES = [
    'members_metafield_values',
    'members_current_subscription',
    'members_stripe_customers_subscriptions',
    'members_newsletters',
    'newsletters',
    'members_products',
    'products',
    'members_labels',
    'labels',
    'members'
];

module.exports.up = function (knex) {
    return Promise.resolve()
        .then(() => knex.schema.createTable('members', (table) => {
            table.increments('id').primary();
            table.string('email', 191);
            table.string('status', 50).notNullable();
            table.dateTime('last_seen_at').nullable();
        }))
        .then(() => knex.schema.createTable('labels', (table) => {
            table.increments('id').primary();
            table.string('slug', 191);
        }))
        .then(() => knex.schema.createTable('members_labels', (table) => {
            table.increments('id').primary();
            table.integer('member_id').unsigned().notNullable();
            table.integer('label_id').unsigned().notNullable();
        }))
        .then(() => knex.schema.createTable('products', (table) => {
            table.increments('id').primary();
            table.string('slug', 191);
        }))
        .then(() => knex.schema.createTable('members_products', (table) => {
            table.increments('id').primary();
            table.integer('member_id').unsigned().notNullable();
            table.integer('product_id').unsigned().notNullable();
        }))
        .then(() => knex.schema.createTable('newsletters', (table) => {
            table.increments('id').primary();
            table.string('slug', 191);
        }))
        .then(() => knex.schema.createTable('members_newsletters', (table) => {
            table.increments('id').primary();
            table.integer('member_id').unsigned().notNullable();
            table.integer('newsletter_id').unsigned().notNullable();
        }))
        .then(() => knex.schema.createTable('members_stripe_customers_subscriptions', (table) => {
            table.increments('id').primary();
            table.string('status', 50).notNullable();
        }))
        .then(() => knex.schema.createTable('members_current_subscription', (table) => {
            table.increments('id').primary();
            table.integer('member_id').unsigned().notNullable();
            table.integer('subscription_id').unsigned().notNullable();
        }))
        .then(() => knex.schema.createTable('members_metafield_values', (table) => {
            table.increments('id').primary();
            table.integer('member_id').unsigned().notNullable();
            table.string('metafield_key', 191).notNullable();
            table.string('value_text', 191).nullable();
        }));
};

module.exports.down = function (knex) {
    return Promise.each(TABLES, table => knex.schema.dropTableIfExists(table));
};

module.exports.tables = TABLES;
