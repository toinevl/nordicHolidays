# C-5 Report: Standardize Import Organization and Fix Dead `.js` Import

## Summary

Implemented IN-04 (fix dead `.js` import in `api/src/index.ts`) and E3 (standardize import
organization with ESLint `simple-import-sort`) from `REVIEW.md` and `IMPROVEMENT-PLAN.md`.

Both issues addressed:
- **IN-04**: Changed `import './functions/citySearch.js'` to `import './functions/citySearch'`
  in `api/src/index.ts`, matching the pattern of all other imports in the file.
- **E3**: Installed `eslint`, `eslint-plugin-simple-import-sort`, and
  `@typescript-eslint/parser` as devDependencies in both `api/` and `frontend/`;
  created `.eslintrc.json` and `.eslintignore` configs; ran `eslint --fix` to
  auto-sort all imports across both codebases.

## Files Created

| File | Purpose |
|------|---------|
| `api/.eslintrc.json` | ESLint config with `simple-import-sort/sort` rule |
| `api/.eslintignore` | Ignores `node_modules/` and `dist/` |
| `frontend/.eslintrc.json` | ESLint config with `simple-import-sort/sort` rule |
| `frontend/.eslintignore` | Ignores `node_modules/` and `dist/` |

## Files Modified

### Configuration (new tooling)
- `api/package.json` — added `@typescript-eslint/parser`, `eslint`, `eslint-plugin-simple-import-sort` to `devDependencies`
- `frontend/package.json` — same three devDependencies added
- `api/package-lock.json` — updated lock file
- `frontend/package-lock.json` — updated lock file

### Source files with import-line changes only
- `api/src/index.ts` — fixed `.js` → no extension; manually sorted 11 side-effect imports alphabetically
- 34 additional `.ts` files in `api/src/` (functions, lib, region, index.test.ts)
- 48 `.ts` files in `frontend/src/` (components, lib, i18n, data, region, api, main.ts, store.ts)

## Import Ordering Standard

The enforced style follows `simple-import-sort` v2.1.0 defaults with three groups,
separated by a single blank line:

1. **External packages** (sorted alphabetically by module specifier)
   - Examples: `@azure/functions`, `jose`, `nanoid`, `openai`, `zod`, `vitest`, `maplibre-gl`
2. **Relative imports** (sorted alphabetically by module path)
   - Examples: `../lib/cors`, `../types`, `./geo`, `./citySearch`
   - `import type` statements are placed by their module specifier, not separated as a group
3. **Side-effect-only imports** (not sorted internally by the plugin)
   - Examples: `import './functions/health'`, `import './styles/main.css'`, `import 'maplibre-gl/dist/maplibre-gl.css'`

Named imports within each `import` statement are also sorted alphabetically
(e.g., `{ authErrorResponse, resolveOwnerId }` instead of `{ resolveOwnerId, authErrorResponse }`).

### Note on IMPROVEMENT-PLAN E3 ordering
E3 suggests the order "externals → internals → relative → side effects." However,
`simple-import-sort` v2.1.0 uses hardcoded group ordering (side-effect → externals → relative)
and does not support a `groups` config option. The plugin's default ordering was used.

Additionally, the project does not use path aliases (`paths` in `tsconfig.json`) — all
non-external imports are relative — so there are no "absolute" imports to standardize.
The standardization is therefore: all externals grouped first, all relative imports grouped
and sorted, all side-effect imports grouped last.

### Manual fix: side-effect imports in `api/src/index.ts`
`simple-import-sort` does not sort side-effect-only imports internally. Since `api/src/index.ts`
contains 11 side-effect imports (all registering Azure Functions), these were manually sorted
alphabetically for consistency:
```
import './functions/cleanup'
import './functions/citySearch'
import './functions/generate'
import './functions/health'
import './functions/itineraries'
import './functions/leads'
import './functions/owner'
import './functions/partners'
import './functions/preferences'
import './functions/profile'
import './functions/track'
```
This reordering is safe — the Azure Functions v4 runtime collects all handler registrations
before serving requests, so import order is irrelevant.

### Post-fix: comma spacing in named imports
`simple-import-sort` reorders named bindings alphabetically but does not normalize spacing.
A follow-up `sed` pass added spaces after commas where the plugin's autofix left them missing
(e.g., `InvocationContext,app` → `InvocationContext, app`). This pass operated exclusively
on lines matching `^(import|export .*from)`.

## IN-04 Fix: Dead `.js` Import

The entry point `api/src/index.ts` imported `citySearch` with a `.js` extension while
all other function imports omitted the extension:

```diff
- import './functions/citySearch.js'
+ import './functions/citySearch'
```

This was inconsistent — the file `api/src/functions/citySearch.ts` exists as a `.ts` source
file. All other imports in `index.ts` use the bare module path without extension, so this
corrects the inconsistency. The `index.test.ts` guard (which asserts every non-test module in
`src/functions/` is imported) already accepts both forms via a regex with optional `.js`,
so this fix does not require test updates.

## Verification

| Check | Result |
|-------|--------|
| ESLint (no autofix) on `api/src/` | 0 errors, 0 warnings |
| ESLint (no autofix) on `frontend/src/` | 0 errors, 0 warnings |
| `api` TypeScript build (`tsc`) | PASS (exit 0) |
| `frontend` build (`tsc --noEmit && vite build`) | PASS (exit 0) |
| Frontend tests (`vitest run`) | 310/310 pass |
| API tests (`vitest run`) | 217/219 pass |
| API test failures | 2 failing in `citySearch.test.ts` — **pre-existing**, caused by an uncommitted `&limit=8` URL parameter added to the fetch call; unrelated to import changes |

## Constraints Honored

- **Only import lines edited**: All source-file changes are on `import`/`export ... from` lines.
  Non-import changes visible in `git diff` are pre-existing uncommitted work from other tasks
  (e.g., accessibility attributes in `GeneratorPanel.ts`/`MapView.ts`, i18n string additions,
  CSS variable changes in `main.css`).
- **No logic changes**: Import reordering, spacing normalization, and extension correction
  do not alter runtime behavior.
- **No auth work**: None touched.
- **No git commit**: Changes remain uncommitted in the working tree.
- **Build verified**: Both `api` and `frontend` compile and build cleanly.
