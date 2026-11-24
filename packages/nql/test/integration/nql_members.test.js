const utils = require('../utils');
const nql = require('../../lib/nql');

const knex = utils.db.client;

// The relation types and names of Ghost's member filter, over the tables in ./members.
// Members (see ./members/fixtures/base.json):
//  1: paid, seen 2026-11-01, label vip, tier gold, weekly newsletter, active subscription, company Ghost
//  2: paid, never seen, tier gold, weekly newsletter, active subscription, company Acme
//  3: free, seen 2026-10-01, label vip, weekly newsletter
//  4: free, never seen, weekly and daily newsletters
//  5: comped, seen 2026-11-20, label vip, tier silver, daily newsletter, canceled subscription, company Ghost
//  6: paid, seen 2025-01-01, labels vip and beta, tier gold, no newsletter, active subscription, company with no value
const options = {
    relations: {
        labels: {
            tableName: 'labels',
            type: 'manyToMany',
            joinTable: 'members_labels',
            joinFrom: 'member_id',
            joinTo: 'label_id'
        },
        products: {
            tableName: 'products',
            type: 'manyToMany',
            joinTable: 'members_products',
            joinFrom: 'member_id',
            joinTo: 'product_id'
        },
        newsletters: {
            tableName: 'newsletters',
            type: 'manyToMany',
            joinTable: 'members_newsletters',
            joinFrom: 'member_id',
            joinTo: 'newsletter_id'
        },
        subscriptions: {
            tableName: 'members_stripe_customers_subscriptions',
            tableNameAs: 'subscriptions',
            type: 'manyToMany',
            joinTable: 'members_current_subscription',
            joinFrom: 'member_id',
            joinTo: 'subscription_id',
            joinToForeign: 'id'
        },
        metafields: {
            tableName: 'members_metafield_values',
            tableNameAs: 'metafields',
            type: 'oneToOne',
            joinFrom: 'member_id'
        },
        label_count: {
            type: 'aggregate',
            aggregate: {fn: 'countDistinct', column: 'members_labels.label_id'},
            tableName: 'members_labels',
            joinFrom: 'member_id'
        }
    },
    expansions: [
        {key: 'label', replacement: 'labels.slug'},
        {key: 'tier', replacement: 'products.slug'}
    ]
};

const memberIds = filter => nql(filter, options)
    .querySQL(knex('members'))
    .select('members.id')
    .orderBy('members.id')
    .then(rows => rows.map(row => row.id));

// Every test returns different members if the negated group is dropped or isn't negated.
// Unless a test says otherwise, its group also tests last_seen_at, which is NULL for members
// 2 and 4, who have never been seen. A comparison with NULL is unknown and so is its plain
// SQL NOT, so those tests also fail if the group is negated with a plain NOT.
describe('Negated groups on members', function () {
    before(utils.db.setup('members'));
    after(utils.db.teardown('members'));

    it('leaves the members a group matches out of a newsletter audience', async function () {
        // No column this group tests holds a NULL
        (await memberIds('newsletters.slug:weekly+-(status:paid+label:vip)')).should.eql([2, 3, 4]);
    });

    it('keeps the members who were never seen when the group tests last_seen_at', async function () {
        (await memberIds('newsletters.slug:weekly+-(last_seen_at:>\'2026-10-15\')')).should.eql([2, 3, 4]);
    });

    it('leaves out a group that ORs a tier with a column', async function () {
        (await memberIds('-(tier:gold,last_seen_at:>\'2026-10-15\')')).should.eql([3, 4]);
    });

    it('applies inside an OR', async function () {
        (await memberIds('status:comped,-(last_seen_at:>\'2026-10-15\')')).should.eql([2, 3, 4, 5, 6]);
    });

    it('leaves out a group on the current subscription', async function () {
        (await memberIds('-(subscriptions.status:active,last_seen_at:>\'2026-10-15\')')).should.eql([3, 4]);
    });

    it('leaves out a group on a custom field value, keeping members with another value or none', async function () {
        (await memberIds('-((metafields.metafield_key:company+metafields.value_text:Ghost),last_seen_at:<\'2026-01-01\')')).should.eql([2, 3, 4]);
    });

    it('leaves out a group on a count of labels', async function () {
        (await memberIds('-(label_count:>1,last_seen_at:>\'2026-10-15\')')).should.eql([2, 3, 4]);
    });

    it('leaves out the members who have every one of several labels', async function () {
        (await memberIds('-(labels.slug:[vip+beta],last_seen_at:>\'2026-10-15\')')).should.eql([2, 3, 4]);
    });

    it('leaves out a group that holds a negated group', async function () {
        // The inner group is the members without the gold tier: 3, 4 and 5
        (await memberIds('-(last_seen_at:>\'2026-10-15\',-(tier:gold))')).should.eql([2, 6]);
    });

    it('leaves out two groups', async function () {
        (await memberIds('-(label:vip)+-(last_seen_at:>\'2026-10-15\')')).should.eql([2, 4]);
    });

    it('leaves out two groups that each negate the same key', async function () {
        // No column these groups test holds a NULL. Each group is the members with that label
        (await memberIds('-(label:-vip)+-(label:-beta)')).should.eql([6]);
    });
});

describe('Negated groups on JSON objects', function () {
    it('matches an object the group does not match', function () {
        const query = nql('newsletters:weekly+-(status:paid+labels:vip)');

        query.queryJSON({newsletters: ['weekly'], status: 'paid', labels: ['vip']}).should.eql(false);
        query.queryJSON({newsletters: ['weekly'], status: 'paid', labels: []}).should.eql(true);
        query.queryJSON({newsletters: ['weekly'], status: 'free', labels: ['vip']}).should.eql(true);
    });

    it('matches an object with no value in the field the group tests', function () {
        const query = nql('-(last_seen_at:>\'2026-10-15\')');

        query.queryJSON({last_seen_at: '2026-11-01 10:00:00'}).should.eql(false);
        query.queryJSON({last_seen_at: null}).should.eql(true);
        query.queryJSON({}).should.eql(true);
    });
});
