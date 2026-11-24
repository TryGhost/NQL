# Mongo Knex

## Installation
1. Make sure that `gstenv` is green. See [Dev Environment](https://github.com/TryGhost/Team/blob/master/Engineering/Dev%20Environment.md) for docs.
2. `git clone` this repo & `cd` into it as usual
3. Run `pnpm install` to install top-level dependencies.

## Run
- Use: `pnpm dev`
- View: [http://localhost:9999](http://localhost:9999)

## Test
- `pnpm lint` run just ESLint
- `pnpm test` run lint && tests
- `NODE_ENV=testing-mysql pnpm test`
  - Manual database creation is currently required.

## Negated groups

`{$nor: [condition, …]}` matches exactly the rows that none of the conditions
match, as in Mongo. The keys of one condition are ANDed.

A row with NULL in a column that a condition tests doesn't match that condition,
so the `$nor` matches the row. Plain SQL gets this wrong: `NOT (image = 'x')` is
unknown for a NULL image, so it leaves the row out. A `$nor` is built as
`NOT EXISTS` over a subquery with no table of its own instead. The subquery's
conditions read the row the query is testing, so it returns a row only when they
are true for that row, and the query keeps every other row:

```sql
where not exists (select 1 where (`posts`.`image` = 'x'))
```

Conditions inside a `$nor` can use every relation type. A `$nor` needs no `id`
column, and it can filter an UPDATE or DELETE of the same table. A one-to-one
relation selects from the filtered table in its own subquery, which MySQL doesn't
allow in an UPDATE or DELETE of that table, inside a `$nor` or not.

## Debug

`DEBUG=mongo-knex:*`
`DEBUG=mongo-knex:converter`
`DEBUG=mongo-knex:converter-extended`

## Config

`config.[env].json`

# Copyright & License

Copyright (c) 2013-2026 Ghost Foundation - Released under the [MIT license](LICENSE).
