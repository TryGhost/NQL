# Fix: Member filtering date range bug (ONC-1446)

## Problem

When filtering Ghost members by date ranges on a manyToMany relation field combined with other conditions on the same relation (e.g., `status:paid + subscriptions.status:active + subscriptions.plan_interval:year + subscriptions.current_period_end >= X + subscriptions.current_period_end <= Y`), the results are **wrong and order-dependent**.

Swapping the order of the two `current_period_end` conditions produces different counts (25 vs 50 on the customer's site).

## Root Cause

**File:** `NQL/packages/mongo-knex/lib/convertor.js`, `groupRelationStatements` method (lines 194-229)

When multiple conditions target the same relation table (e.g., `subscriptions`), they're grouped into a single subquery. But when two conditions share the **same column** (e.g., both on `current_period_end`), the second one is forced into a **separate subgroup/subquery**.

The critical problem: the orphaned condition loses the other same-table constraints (`status=active`, `plan_interval=year`).

### Concrete trace with the customer's filters

All `subscriptions.*` conditions are collected as relation statements, then grouped:

**Filter A** (`$lte` before `$gte` → returns 25):
```
Group 'subscriptions':   [status=active, plan_interval=year, current_period_end <= Feb 28]
Group 'subscriptions_3)': [current_period_end >= Feb 1]  ← NO status/plan_interval!
```
- Subquery 1: members with an active yearly sub ending ≤ Feb 28
- Subquery 2: members with ANY subscription (active/inactive/monthly/yearly) ending ≥ Feb 1
- Intersection: 25

**Filter B** (`$gte` before `$lte` → returns 50):
```
Group 'subscriptions':   [status=active, plan_interval=year, current_period_end >= Feb 1]
Group 'subscriptions_3)': [current_period_end <= Feb 28]  ← NO status/plan_interval!
```
- Subquery 1: members with an active yearly sub ending ≥ Feb 1 (broad — most yearly subs)
- Subquery 2: members with ANY subscription ending ≤ Feb 28 (very broad)
- Intersection: 50

**Why order matters:** whichever `current_period_end` condition comes first stays in the main group (keeping `status` and `plan_interval`). The second gets orphaned into its own subquery without those constraints, matching any subscription type.

## Fix

### 1. Modify `groupRelationStatements`

**File:** `/Users/chris/Developer/TryGhost/NQL/packages/mongo-knex/lib/convertor.js`

In the `groupRelationStatements` method (lines 204-209), change the same-column check to only create separate subgroups when operators are NOT both range operators:

```javascript
// BEFORE (lines 204-209):
if (!createSubGroup && group[statement.table]) {
    createSubGroup = _.find(group[statement.table].innerWhereStatements, (innerStatement) => {
        if (innerStatement.column === statement.column) {
            return true;
        }
    });
}

// AFTER:
if (!createSubGroup && group[statement.table]) {
    createSubGroup = _.find(group[statement.table].innerWhereStatements, (innerStatement) => {
        if (innerStatement.column === statement.column) {
            // Range operators ($gt, $gte, $lt, $lte) on the same column should stay
            // in the same subquery — they define a range on a single row.
            // Equality/set operators need separate subqueries because each
            // condition must match a different row in manyToMany relations.
            const rangeOps = ['$gt', '$gte', '$lt', '$lte'];
            if (rangeOps.includes(innerStatement.operator) && rangeOps.includes(statement.operator)) {
                return false;
            }
            return true;
        }
    });
}
```

**Why this is correct:**
- Range ops (`$gte` + `$lte`) on the same column define a range on a **single row** → same subquery
- Equality ops (`$eq`) on the same column (e.g., `tags.slug='animal' AND tags.slug='classic'`) must match **different rows** → separate subqueries (existing behavior preserved)
- Existing test `tags.slug is animal and classic` uses `$eq` → unaffected

### 2. Add integration tests

**File:** `/Users/chris/Developer/TryGhost/NQL/packages/mongo-knex/test/integration/relations.test.js`

Add tests inside the `AND $and` section that cover:

1. **Range on same column with other same-table conditions** (the exact customer bug):
   `$and: [{tags.slug: 'classic'}, {tags.created_at: {$gte: '2015-01-01'}}, {tags.created_at: {$lte: '2015-06-01'}}]`
   - Must return same results regardless of whether $gte or $lte comes first
   - Both date conditions must respect the `slug='classic'` constraint

2. **Strict range producing zero results**:
   `$and: [{tags.created_at: {$gt: '2015-01-01'}}, {tags.created_at: {$lt: '2015-01-02'}}]`
   - No single tag has created_at strictly between Jan 1 and Jan 2 → 0 results

3. **Order independence**:
   Same conditions as test 1 but with `$lte` before `$gte` → same results

## Verification

1. `cd /Users/chris/Developer/TryGhost/NQL/packages/mongo-knex`
2. Write failing tests first, run: `yarn test` → confirm new tests fail (order-dependent results)
3. Apply the fix to `lib/convertor.js`
4. Run `yarn test` → confirm ALL tests pass (new + existing)
5. Verify existing `tags.slug is animal and classic` test still passes (ensures `$eq` still creates separate subqueries)
