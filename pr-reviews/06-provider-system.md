# Review: Provider System Changes

## Files Reviewed

- `packages/opencode/src/provider/provider.ts`
- `packages/opencode/src/provider/auth.ts`
- `packages/opencode/src/provider/error.ts`
- `packages/opencode/src/provider/transform.ts`

## Summary

Changes to support non-OpenAI Azure models and improved provider/model ID branding throughout internal signatures.

## Key Changes

### 1. Azure Non-OpenAI Model Support

Added support for Azure models that use completions endpoints instead of chat completions.

### 2. Provider ID Branding

All internal signatures now use branded `ProviderID` instead of raw strings:

```typescript
// Before
function getProvider(id: string): Provider

// After
function getProvider(id: ProviderID): Provider
```

### 3. Model ID Branding

Similarly, `ModelID` is now branded throughout the codebase.

### 4. Google Vertex Location Support

Added `GOOGLE_VERTEX_LOCATION` environment variable support for Vertex AI configuration.

### 5. SAP AI Provider Thinking Variants

Added thinking variants support for SAP AI provider.

## Well-Known Providers

```typescript
ProviderID.kilo // "kilo"
ProviderID.opencode // "opencode"
ProviderID.anthropic // "anthropic"
ProviderID.openai // "openai"
ProviderID.google // "google"
ProviderID.googleVertex // "google-vertex"
ProviderID.githubCopilot // "github-copilot"
ProviderID.azure // "azure"
ProviderID.openrouter // "openrouter"
// ... etc
```

## Quality Assessment

- Proper type safety with branded IDs
- Backward compatibility maintained through `make()` helpers
- Clear separation between provider types

## Verdict

**APPROVED** - Type safety improvements are welcome. Azure support expands deployment options.
