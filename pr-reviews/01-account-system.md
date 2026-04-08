# Review: Account System (New Feature)

## Files Reviewed

- `packages/opencode/src/account/account.sql.ts` (new)
- `packages/opencode/src/account/index.ts` (new)
- `packages/opencode/src/account/repo.ts` (new)
- `packages/opencode/src/account/schema.ts` (new)
- `packages/opencode/src/account/service.ts` (new)

## Summary

This PR introduces a comprehensive **Account System** that enables multi-account workspace authentication with organization support. This is a foundational change for supporting enterprise/team features.

## Key Components

### 1. Account Schema (`schema.ts`)

Introduces Effect Schema-based branded types:

- `AccountID` - Branded string for account identification
- `OrgID` - Branded string for organization identification
- `AccessToken` / `RefreshToken` - Branded tokens for auth
- `DeviceCode` / `UserCode` - OAuth device flow codes

**Quality: GOOD** - Proper use of Effect Schema branding for type safety.

### 2. Account Service (`service.ts`)

A complete Effect-based service implementation with:

- Device OAuth flow (`login()`, `poll()`)
- Token refresh with automatic persistence
- Organization fetching (`fetchOrgs()`)
- Multi-account resolution (`orgsByAccount()`)

**Key Methods:**

- `login(server)` - Initiates device auth flow
- `poll(input)` - Polls for auth completion
- `token(accountID)` - Returns usable access token (auto-refreshes)
- `config(accountID, orgID)` - Fetches org-specific configuration

**Quality: GOOD** - Well-structured with proper error handling using Effect.

### 3. Repository Layer (`repo.ts`)

SQLite-backed storage using Drizzle ORM:

- Stores account metadata (id, email, url, active_org_id)
- Token storage with expiry tracking
- Support for account switching (`use()`)

**Quality: GOOD** - Clean separation of concerns.

### 4. SQL Schema (`account.sql.ts`)

```sql
- account table: id, email, url, active_org_id, access_token, refresh_token, token_expiry
- account_org table: account_id, org_id, org_name (many-to-many)
```

## Security Considerations

- Tokens are stored in SQLite with expiry tracking
- Refresh tokens are used to obtain new access tokens
- Device flow is used instead of direct credential handling

## Potential Concerns

1. **Token Storage**: Tokens stored in local SQLite - acceptable for CLI but document security model
2. **Org Selection**: TODO comment indicates org selection isn't implemented yet (defaults to first org)

## Migration Impact

- New database tables will be created automatically via migrations
- Existing single-account users will need to re-authenticate

## Verdict

**APPROVED** - Well-designed account system with proper abstractions. Critical foundation for multi-account support.
