**GraphQL Playground**
A local GraphQL IDE built with React, Vite, and Monaco. Connect to any GraphQL endpoint, explore the schema, build queries with parameter helpers, run them, and inspect results with history and code snippets.

**Tech Stack**
- `Vite` + `React 19` + `TypeScript`
- `Tailwind CSS` + `shadcn/ui` (Radix primitives)
- `Zustand` for client state
- `Monaco Editor` via `@monaco-editor/react`
- `graphql` + `graphql-language-service`
- `echarts` for schema graph visualization

**Quick Start**
```bash
npm install
npm run dev
```

**Scripts**
```bash
npm run dev
npm run build
npm run preview
npm run lint
```

**Feature Tour**
- Connect to a GraphQL endpoint and introspect its schema
- Monaco-based query editor with tabs, formatting, and shortcuts
- Schema-aware autocomplete and hover docs (meta fields like `__typename` filtered out)
- Parameters builder with inline arguments or variables-panel mode
- Selection builder for root fields with safe defaults
- Variables and headers editors (JSON)
- Response viewer with status, timing, size, copy, and download
- Code snippets for `curl`, JavaScript, Python, PHP, and C#
- Docs, schema SDL viewer, types generator, and schema graph explorer
- History panel for restoring prior queries

**How It Works**
- Connection flow: `src/App.tsx` calls `introspectSchema` from `src/lib/introspection.ts`, then stores `schema`, `schemaSDL`, and `introspectionResult` in `src/store/useStore.ts`.
- Query flow: `src/components/QueryEditor.tsx` runs `executeQuery` and writes response metadata to the store, then `src/components/ResponsePanel.tsx` renders it and `src/components/HistoryPanel.tsx` saves a history entry.
- Language tooling: `src/lib/graphqlLanguage.ts` registers the GraphQL Monaco language, themes, completion provider, and hover provider.
- Docs flow: `src/components/DocsPanel.tsx` uses `parseSchemaForDocs` to present queries, mutations, types, and field details.
- Types flow: `src/components/TypesPanel.tsx` generates TypeScript interfaces from the introspected schema.
- Graph explorer: `src/components/GraphExplorer.tsx` builds a schema graph using `echarts`.

**State Model**
The Zustand store in `src/store/useStore.ts` is the single source of truth. Key fields:
- `endpoint`, `connectionStatus`, `connectionError`
- `schema`, `schemaSDL`, `introspectionResult`
- `tabs`, `activeTabId`
- `response`, `responseStatus`, `responseTime`, `responseSize`, `isExecuting`
- `history`
- `theme`, `docsOpen`, `activeBottomTab`

Persistence is handled by `zustand/middleware` and saves `endpoint`, `history`, and `theme` to `localStorage` under `gql-playground-storage`.

**Parameters And Variables**
The parameters panel in `src/components/ParametersPanel.tsx` works directly against the schema for the selected root field.
- Inline mode writes literal argument values into the query and removes variable definitions for those arguments.
- Variables mode writes values into the Variables editor and injects variable definitions into the query.
- The mode is per-argument and can be toggled in the Parameters panel.
- When the query is edited directly, the panel re-parses arguments and variable definitions to stay in sync.
- The selection builder updates the root field selection set and ensures non-empty selections by inserting `__typename` when needed.

**Project Map**
- `src/App.tsx` layout, connect/disconnect, theme toggle, panel routing
- `src/main.tsx` React entry
- `src/store/useStore.ts` app state and actions
- `src/components/QueryEditor.tsx` query editor, tabs, run, prettify
- `src/components/ParametersPanel.tsx` arguments and selection builders
- `src/components/ResponsePanel.tsx` response viewer and code snippets
- `src/components/DocsPanel.tsx` schema docs and field browser
- `src/components/SchemaViewer.tsx` SDL viewer
- `src/components/TypesPanel.tsx` TypeScript type generator
- `src/components/GraphExplorer.tsx` schema graph
- `src/components/HistoryPanel.tsx` history list and restore
- `src/lib/introspection.ts` introspection, execution, parsing helpers
- `src/lib/graphqlLanguage.ts` Monaco GraphQL language, completion, hover
- `src/lib/snippets.ts` request code snippets
- `src/lib/utils.ts` `cn` class utility
- `src/components/ui` shared UI primitives (shadcn/Radix)

**Notes**
- Autocomplete and docs require a successful schema introspection.
- Variables and headers must be valid JSON objects; invalid JSON is surfaced in the UI or at execution time.
