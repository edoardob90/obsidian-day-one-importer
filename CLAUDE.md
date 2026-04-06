# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

An Obsidian plugin that imports Day One journal exports (JSON) into Obsidian as markdown notes with frontmatter. Supports photos, videos, audio, PDFs, internal link resolution, tag formatting, and timezone-aware dates.

## Commands

```bash
npm run dev          # Watch mode (esbuild)
npm run build        # Typecheck + production build
npm test             # Run all tests (TZ=UTC, Jest)
npm run test:watch   # Watch mode for tests
npm run lint         # ESLint + Prettier check
npm run lint:fix     # Auto-fix lint issues
npm run typecheck    # tsc --noEmit
```

Tests **must** run with `TZ=UTC` (enforced in package.json and verified by `test/timezone.test.ts`). To run a single test file: `TZ=UTC npx jest test/import-json.test.ts`.

## Architecture

```
main.ts (Plugin entry point, settings interface, lifecycle)
├── settings-tab.ts (UI — triggers import/update/resolve actions)
│   ├── import-json.ts (creates new .md files from JSON entries)
│   ├── update-front-matter.ts (updates frontmatter on existing files)
│   └── resolve-internal-links.ts (scans notes, resolves Day One links post-import)
├── schema.ts (Zod validation for Day One JSON entries + media objects)
├── utils.ts (shared: buildFileName, buildFileBody, resolveInternalLinks, collectDayOneEntries, tag transforms, type guards)
└── uuid-map.ts (persists UUID→filename map in plugin data for cross-import link resolution)
```

**Key data flow:** JSON entries are validated with Zod (`schema.ts`), collected via `collectDayOneEntries()` (`utils.ts`), then each entry gets a markdown file created (`import-json.ts`) with frontmatter written via `processFrontMatter` (`update-front-matter.ts`). Internal Day One links (`dayone://view?entryId=UUID`) are resolved to Obsidian wiki-links using a persisted UUID map.

## Testing Patterns

- Obsidian API is mocked in `test/__mocks__/obsidian.mocks.ts` (mapped via `jest.config.js`)
- Tests create mock `Vault`, `FileManager`, `Events` objects with `jest.fn()` methods
- `processFrontMatter` mock captures frontmatter objects into an array for assertions
- Type guards (`isTFile`, `isTFolder`) are used instead of `instanceof` to avoid test breakage
- Test data lives in `test/__test_data__/day-one-in/`

## Branch Structure

- `main` — tracks upstream (`MarcDonald/obsidian-day-one-importer`) exactly
- `custom` — fork's working branch with all custom features (luxon, PDF support, tag styles, etc.)
- `feature/*` — feature branches for PRs against upstream, branched from `main`

## Key Dependencies

- **zod**: Runtime schema validation for Day One JSON
- **luxon**: Date/timezone handling (on `custom` branch; `feature/*` branches targeting upstream use `moment` from `'obsidian'`)
- Obsidian API externalized at build time (esbuild)
