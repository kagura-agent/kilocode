# Review: Type Branding Improvements

## Files Reviewed

- `packages/opencode/src/provider/schema.ts`
- `packages/opencode/src/project/schema.ts`
- `packages/opencode/src/session/schema.ts`
- `packages/opencode/src/question/schema.ts`
- `packages/opencode/src/permission/schema.ts`
- `packages/opencode/src/pty/schema.ts`
- `packages/opencode/src/tool/schema.ts`

## Summary

This PR introduces comprehensive **type branding** across the codebase using Effect Schema. This is a significant improvement for type safety, preventing accidental mixing of string identifiers.

## Changes Overview

### Provider Schema

```typescript
// Before: type ProviderID = string
// After:
const providerIdSchema = Schema.String.pipe(Schema.brand("ProviderID"))
export type ProviderID = typeof providerIdSchema.Type
export const ProviderID = providerIdSchema.pipe(
  withStatics((schema) => ({
    make: (id: string) => schema.makeUnsafe(id),
    zod: z.string().pipe(z.custom<ProviderID>()),
    kilo: schema.makeUnsafe("kilo"), // Well-known providers
    // ... other providers
  })),
)
```

### All Branded Types

| Type           | Brand          | Has Zod Schema |
| -------------- | -------------- | -------------- |
| `ProviderID`   | "ProviderID"   | Yes            |
| `ModelID`      | "ModelID"      | Yes            |
| `ProjectID`    | "ProjectID"    | Yes            |
| `SessionID`    | "SessionID"    | Yes            |
| `MessageID`    | "MessageID"    | Yes            |
| `PartID`       | "PartID"       | Yes            |
| `PermissionID` | "PermissionID" | Yes            |
| `QuestionID`   | "QuestionID"   | Yes            |
| `PtyID`        | "PtyID"        | Yes            |
| `ToolID`       | "ToolID"       | Yes            |

## Quality Assessment

**Strengths:**

1. **Type Safety**: Prevents mixing different ID types (e.g., can't use SessionID where ToolID expected)
2. **Consistency**: All IDs follow the same pattern
3. **Zod Integration**: Provides Zod schemas for runtime validation alongside compile-time types
4. **Helper Methods**: Each provides `make()`, ID-specific generators (`ascending()`, `descending()`)

**Pattern Used:**

```typescript
const schema = Schema.String.pipe(Schema.brand("BrandName"))
export type BrandName = typeof schema.Type
export const BrandName = schema.pipe(
  withStatics((s) => ({
    make: (id: string) => s.makeUnsafe(id),
    // helpers...
  })),
)
```

## Database Integration

The branded types are properly integrated with Drizzle ORM:

```typescript
// In project.sql.ts
export const ProjectTable = sqliteTable("project", {
  id: text().$type<ProjectID>().primaryKey(),
  // ...
})
```

## Verdict

**APPROVED** - Excellent type safety improvement. The consistent pattern across all ID types makes the codebase more robust.
