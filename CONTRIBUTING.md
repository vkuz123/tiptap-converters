# Contributing

## Development

```bash
git clone https://github.com/vkuz123/tiptap-converters.git
cd tiptap-converters
npm install
```

## Running Tests

```bash
npm test          # Run all tests once
npm run test:watch # Watch mode
```

## Building

```bash
npm run build     # Builds ESM + CJS + .d.ts via tsup
npm run lint      # TypeScript type checking
```

## Adding a New Format

1. Create `src/import/yourformat.ts` (and/or `src/export/yourformat.ts`)
2. Use the shared types from `src/core/types.ts` (`ParseResult`, `TipTapNode`, `TipTapDoc`)
3. Add an entry point in `tsup.config.ts`
4. Add the export map entry in `package.json`
5. Add format-specific deps as optional peer dependencies
6. Write tests in `tests/import/yourformat.test.ts`
7. Add a roundtrip test if you have both import and export
8. Update the README format table

## Project Structure

```
src/
  core/           # Shared types, content utilities, format detection
  import/         # Format → TipTap converters (one file per format)
  export/         # TipTap → format converters
  pipeline/       # Structured authoring pipeline (resolve, filter, variables)
  index.ts        # Barrel re-export

tests/
  import/         # Import converter tests
  export/         # Export converter tests
  pipeline/       # Pipeline stage tests
  roundtrip/      # Roundtrip fidelity tests
  core/           # Core utility tests
  fixtures/       # Sample documents for tests
```

## Code Style

- Pure functions, no side effects
- No framework dependencies (React, Next.js, etc.)
- Format-specific dependencies stay in their own files (tree-shaking)
- Use `ParseResult` from core types for all import converters
- Use `@tiptap/core`'s `JSONContent` type for export converters
