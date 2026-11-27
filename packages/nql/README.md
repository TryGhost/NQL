# NQL
The aim is putting together various nql related projects into single, easy to use api. It allows:
 - parsing of NQL expression into Mongo JSON (using [nql-lang](https://github.com/TryGhost/NQL/tree/main/packages/nql-lang))
 - enhancing a database query with additional filters based on provided expression (using [mongo-knex](https://github.com/TryGhost/NQL/tree/main/packages/mongo-knex))
 - querying JSON objects with NQL expressions (using [mingo](https://github.com/kofrasa/mingo))

## Installation
Using npm:
```
npm install @tryghost/nql --save
```
or with yarn:
```
yarn add @tryghost/nql
```

## Example
A simple NQL expression could have following form: `featured:true+slug:['photo', 'video']`
When parsing it to Mongo JSON with `nql(expression).parse()` the output would be:
```javascript
{
    $and: [
        {
            featured: true
        },
        {
            slug: {
                $in: ['photo', 'video']
            }
        }
    ]
}
```

If the same expression would be applied to Knex [QueryBuilder](https://knexjs.org/#Builder) object, the following SQL where statement would be generated:
```sql
where (`posts`.`featured` = true and `posts`.`slug` in ('photo', 'video'))
```

## Negating a group
A minus before a value negates that value, as in `status:-free`. A minus directly before brackets negates the whole group, so the filter matches everything the group doesn't. Subscribers to the weekly newsletter who aren't paid members labelled VIP are:

```
newsletters.slug:weekly+-(status:paid+labels.slug:vip)
```

The negated group parses to a `$nor` that holds the group:
```javascript
{
    $and: [
        {'newsletters.slug': 'weekly'},
        {$nor: [{$and: [{status: 'paid'}, {'labels.slug': 'vip'}]}]}
    ]
}
```

A negated group matches exactly the rows the group doesn't match, including a row with NULL in a column the group tests. A member who has never been seen doesn't match `last_seen_at:>'2026-10-15'`, so `-(last_seen_at:>'2026-10-15')` matches them.

Groups can hold relations, other negated groups and either kind of separator, and a negated group can sit anywhere a bracketed group can, as in `status:comped,-(tier:gold+label:vip)`.

## Keys whose values are text
A value written without quotes is read as a number, `null`, `true`, `false` or a relative date when it looks like one, so `tag:2024` compares the tag with the number 2024 and `tag:null` compares it with no value at all. A key whose values are always text, such as a key that names a record by its slug, can be listed in `textKeys`. Every value of a listed key is then read as the text it is written as, as if it were quoted:

```javascript
nql('tag:2024,tag:null', {textKeys: ['tag']}).toJSON();
// => {$or: [{tag: '2024'}, {tag: 'null'}]}
```

A listed key can't be compared with null, so a key that can be null shouldn't be listed. The keys are matched as the filter writes them, before `expansions` rename them, so each way of writing a key needs listing, and the overrides and the defaults are read with the same keys. The values of every other key are read as before.

## Usage
Some common usages:
```javascript
nql('id:3').toJSON();
\\ => {id:3}
```

```javascript
nql('id:3').queryJSON({test:true, id:3});
\\ => true
```

```javascript
nql('tags:test', {expansions: {tags: 'tags.slug'}}).toJSON();
\\ => {'tags.slug': test}
```
```javascript
nql('primary_tag:[photo]', {expansions: [
      {key: 'primary_tag', replacement: 'tags.slug', expansion: 'order:0'}
  ]})
\\ => {$and: [{'tags.slug': {$in: ['photo']}}, {order: 0}]}
```

Advanced usage example:

```javascript
// Builds SQL where statement on top of knex Query Builder including:
//  - combining custom filter 'primary_tag:test' with overrides filter and defaults
//  - expanding shortcut property 'primary_tag' into 'tags.slug' and adding 'posts_tags.sort_order:0' filter
//  - builds a where statement with related `tags` table through manyToMany relation
const query = nql('primary_tag:test', {
    relations: {
        tags: {
            tableName: 'tags',
            type: 'manyToMany',
            joinTable: 'posts_tags',
            joinFrom: 'post_id',
            joinTo: 'tag_id'
        }
    },
    expansions: [
        {
            key: 'primary_tag',
            replacement: 'tags.slug',
            expansion: 'posts_tags.sort_order:0'
        }
    ],
    overrides: 'status:published',
    defaults: 'featured:true'
});

query
    .querySQL(knex('posts'))
    .select();
```

## Test
- `pnpm lint` run just ESLint
- `pnpm test` run lint && tests

# Copyright & License

Copyright (c) 2013-2026 Ghost Foundation - Released under the [MIT license](LICENSE).
