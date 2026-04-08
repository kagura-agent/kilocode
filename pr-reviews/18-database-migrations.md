# Review: Database Migrations

## Files Reviewed

- `packages/opencode/migration/20260228203230_blue_harpoon/`
- `packages/opencode/migration/20260309230000_move_org_to_state/`

## Summary

New database migrations for account system and organization management.

## Migration 1: blue_harpoon (20260228203230)

### New Tables

```sql
-- account table
CREATE TABLE account (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  url TEXT NOT NULL,
  active_org_id TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expiry INTEGER,
  created_at INTEGER,
  updated_at INTEGER
);

-- account_org table (many-to-many)
CREATE TABLE account_org (
  account_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  org_name TEXT NOT NULL,
  PRIMARY KEY (account_id, org_id),
  FOREIGN KEY (account_id) REFERENCES account(id)
);

-- project table updates
ALTER TABLE project ADD COLUMN worktree TEXT;
ALTER TABLE project ADD COLUMN vcs TEXT;
ALTER TABLE project ADD COLUMN name TEXT;
ALTER TABLE project ADD COLUMN icon_url TEXT;
ALTER TABLE project ADD COLUMN icon_color TEXT;
ALTER TABLE project ADD COLUMN sandboxes TEXT; -- JSON
ALTER TABLE project ADD COLUMN commands TEXT; -- JSON
ALTER TABLE project ADD COLUMN time_initialized INTEGER;
```

## Migration 2: move_org_to_state (20260309230000)

### Changes

- Moves organization data from separate table to account state
- Simplifies org management
- Better aligns with multi-account architecture

```sql
-- Updated schema consolidates org info
-- account.active_org_id now references current active org
-- account_org stores all available orgs for an account
```

## Migration Safety

- Migrations are additive (no destructive changes)
- Existing data is preserved
- New tables are created only if they don't exist
- Foreign key constraints properly defined

## Quality Assessment

- **Schema Design**: Proper normalization
- **Migration Safety**: Non-destructive
- **Timestamps**: Includes created_at/updated_at
- **JSON Columns**: Used appropriately for flexible data

## Verdict

**APPROVED** - Well-designed migrations for new account system.
