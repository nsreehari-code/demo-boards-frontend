# UI Flags & Behaviors — Source of Truth

A single consolidated reference for every flag, config knob, and behavior that
influences how the demo-boards frontend renders. It covers four layers:

1. **App config** (`app-config.json`) — global UI/transport/storage knobs (§7).
2. **Board UI config** (board `ui.*`) — per-board pane/renderer wiring (§8).
3. **Card meta flags** (`meta.*`) — flags the UI reads off each card (§0–§4).
4. **Card view/element knobs** (`view.elements[].data.*`) — per-element render
   options (§5).

Each entry says **what** the knob is, **where it lives**, **who sets it**, and
**how it renders**.

> Scope: this is a *reference index*, not a tutorial. Authoring guidance for
> agents lives in the backend
> (`demo-board/server/chat-flow/instructions/agent-instructions-2-cardlayout.md`
> and `.../skills/manage-cards-on-live-board/SKILL.md`); this doc maps those
> knobs to the frontend code that actually consumes them.

---

## Quick index

| Category | Knobs | Set by | Rendered / consumed in |
| --- | --- | --- | --- |
| Presentation (layout) | `meta.presentation.prominence`, `.footprint`, `.resizable` | Agent (card author) | `src/lib/boardCanvasLayout.js`, `src/components/CardShell.jsx` |
| Path state (lifecycle) | `meta.path_state`, `meta.path_state_rationale` | Agent (card author) | `src/components/CardShell.jsx`, `src/theme.css` |
| Runtime status | `cardRuntime.status` | Runtime (not authored) | `src/components/CardShell.jsx`, `src/theme.css` |
| Pane routing | pane names (`gandalf`, `truthset`, …) — *match conditions are config-driven* | Board UI config / template | `src/lib/cardPresentationConfig.js` |
| Renderer selection | renderer names (`default`, `ingest`) — *match conditions are config-driven* | Board UI config / template | `src/components/CardRenderer.jsx` |
| View kinds | `view.elements[].kind` | Agent (card author) | `src/components/registry/cardview/*.jsx` |
| Element render options | `view.elements[].data.*` (columns, chartType, writeTo, colorMap, thresholds, …) | Agent (card author) | `src/components/renderers/CardviewRenderer.jsx`, `src/components/registry/engine/NodeRenderer.jsx` |
| App config | `app-config.json` (transportMode, serverOrigin, storage, canvasLayout, …) | Deployer | `src/lib/appConfig.js` |
| Board UI config | board `ui.paneRules`, `ui.cardRendererRules` | Board / template | `src/hooks/useManagedBoardConfig.js`, `src/lib/cardPresentationConfig.js` |
| Layout & persistence | canvas positions/widths, width bounds, autosave | Runtime (user drag/resize) | `src/lib/boardCanvasLayout.js`, `src/hooks/useCoordsState.jsx`, `src/lib/boardLayoutCache.js` |
| Filter syntax | `when` expressions (JSONata) | Board / template | `src/lib/cardFilterExpression.js` |
| Watch-party streams | `channel` (`agent-output`, `agent-tools`) | Backend handlers | SSE → chat / activity pane |

---

## 0. Flags recognized by the UI code

This is the set of `meta.*` fields the frontend reads **directly** (hard-coded in
components / layout) — i.e. the flags the UI itself recognizes regardless of any
board template. Each links to its detailed section below.

| Flag | Read in | Purpose |
| --- | --- | --- |
| `meta.title` | `CardShell.jsx`, `IngestCard.jsx`, `PostboxCard.jsx`, `StrategistCard.jsx`, `InfiniteCanvasPane.jsx`, `boardCanvasLayout.js` | Card title; falls back to the card id when absent. |
| `meta.presentation.prominence` | `boardCanvasLayout.js` | Ordering weight (§1). |
| `meta.presentation.footprint` | `boardCanvasLayout.js` | Card width (§1). |
| `meta.presentation.resizable` | `CardShell.jsx` | Whether the user may resize at runtime (§1). |
| `meta.path_state` | `CardShell.jsx` | Lifecycle annotation — dims/greys/strikes the body (§2). |
| `meta.path_state_rationale` | `CardShell.jsx` | Hover explanation for the path state (§2). |

> **Not in this list:** flags like `meta.gandalf`, `meta.truthset`,
> `meta.ingest`, `meta.confidential`, `meta.highconfidential`. The UI code does
> **not** hard-code these — they only appear inside **config-driven pane/renderer
> match expressions** (§4), which a board template can redefine arbitrarily
> (e.g. use `meta.louis` instead of `meta.gandalf`). They are board-specific
> wiring, not flags the UI itself recognizes.

Legacy field still honored: `view.layout.canvas.h` (a card height hint read by
`boardCanvasLayout.js` when no stored size exists).

---

## 1. Presentation flags (`meta.presentation.*`)

Authored by the agent to say how a card should *feel*; the frontend computes the
actual placement and size. Consumed in
[src/lib/boardCanvasLayout.js](src/lib/boardCanvasLayout.js).

### `meta.presentation.prominence`

How much the user should care about the card. Drives vertical ordering within a
column (lower weight is placed nearer the top).

| Value | Weight | Meaning |
| --- | --- | --- |
| `spotlight` | 0 | Highest priority; placed first. |
| `feature` | 1 | Above standard. |
| `standard` | 2 | **Default** (omit unless deliberately higher/lower). |
| `glance` | 3 | Low priority; placed last. |

Unknown values fall back to `standard`.

### `meta.presentation.footprint`

How much horizontal room the card needs, independent of attention. Maps directly
to a pixel width (`FOOTPRINT_WIDTH` in `boardCanvasLayout.js`).

| Value | Width (px) |
| --- | --- |
| `compact` | 300 |
| `standard` | 360 (**default**) |
| `wide` | 440 |
| `large` | 520 |

Unknown values fall back to the global `defaultCardWidth` (360).

### `meta.presentation.resizable`

Whether the user may drag-resize the card at runtime. Default `true`; set `false`
for fixed-size cards. Live width is runtime-owned and persisted separately from
the card definition (see `useCardWidthState` in `CardShell.jsx`).

---

## 2. Path-state flags (`meta.path_state*`)

Agent-authored lifecycle annotation for a line of inquiry on exploration /
journey boards. **Annotation only** — it never changes reactive-graph evaluation.
The body content is visually marked while all header actions (inspect, refresh,
chat) stay live. Defined as `PATH_STATE_DEFS` in
[src/components/CardShell.jsx](src/components/CardShell.jsx) and styled in
[src/theme.css](src/theme.css).

### `meta.path_state`

Omit for active paths. Recognized values (anything else is ignored):

| Value | Pill label | Body treatment (theme.css) |
| --- | --- | --- |
| `suspended` | "Suspended" | `opacity 0.62`, `grayscale 0.45` — parked, may resume. |
| `dead_ended` | "Ruled out" | `opacity 0.5`, `grayscale 0.7` + tinted border — ruled out by evidence. |
| `wiped` | "Wiped" | `opacity 0.34`, `grayscale 1` + diagonal hatch + tinted border — abandoned, kept as a breadcrumb. |

The pill is rendered by `PathStateOverlay` as a body overlay
(`.board-card__path-overlay`), **not** in the header. The card root also gets a
`board-card--path-${value}` class.

### `meta.path_state_rationale`

One sentence explaining the state; surfaced as the overlay's hover `title`.

> Persistence note: path state lives in `meta`, distinct from
> `meta.presentation.*` (layout) and `card_data` (user-owned). Agents should read
> back `meta.path_state` on later passes to avoid re-walking a `dead_ended` path.

---

## 3. Runtime status (`cardRuntime.status`)

Not an authored flag — derived from runtime fetch/compute state
(`cardState.cardRuntime?.status`, default `fresh`). Mapped to a tone class by
`getStatusTone()` in [src/components/CardShell.jsx](src/components/CardShell.jsx).

| `status` | Tone class | CSS variable group (theme.css) |
| --- | --- | --- |
| `completed` | `board-tone--completed` | green / success |
| `running` | `board-tone--running` | running (animated) |
| `failed` | `board-tone--failed` | red / danger |
| `blocked` | `board-tone--blocked` | amber / warning |
| _anything else_ | `board-tone--fresh` | neutral (default) |

### Tone aliases (theme.css)

Tone classes share `--status-color` variables, so these aliases all resolve to
the same palette and are interchangeable in `colorMap`:

- **completed**: `board-tone--completed` = `--done` = `--green` = `--success`
- **failed**: `board-tone--failed` = `--red` = `--danger`
- **blocked**: `board-tone--blocked` = `--amber` = `--warning`

---

## 4. Implemented renderers & panes

A card is routed to one of the currently implemented **pane surfaces** and then
rendered by one of the currently implemented **renderer names**. The pane /
renderer *selection* is still driven by config (`paneRules`, `cardRendererRules`
in board UI config), but the list below is the actual UI that exists today.

### Implemented pane surfaces (current code)

`BoardRenderer` (the board tier's resolution host) mounts exactly three pane surfaces:

| Implemented pane surface | Component | What it does |
| --- | --- | --- |
| Main Canvas / centre pane | `CentrePane` | The default board surface. In current wiring it uses `layoutStrategy="infinite-canvas"` and renders unmatched cards on `InfiniteCanvasPane`. |
| Left rail ingest pane | `IngestPane` | A toggleable fixed left rail labelled `Board Manager`, showing one filtered card at a time with prev/next navigation. |
| Right rail truthset pane | `TruthsetExplorePane` | A toggleable fixed right rail labelled `Truthset Explore`, showing one filtered card at a time with prev/next navigation. |

In the current `BoardRenderer` wiring, the board UI config pane named `gandalf`
feeds the **left rail ingest pane**, the pane named `truthset` feeds the **right
rail truthset pane**, and cards excluded from both feed the **Main Canvas**.
Those pane *names* come from config; the three pane *surfaces* above are what is
actually implemented.

### Renderers (what each one renders — this is the truth)

Resolved by `resolveCardRenderer()` and switched in
[src/components/CardRenderer.jsx](src/components/CardRenderer.jsx). First matching
rule wins; unmatched cards fall back to `default`.

| Renderer name | Component | What it renders |
| --- | --- | --- |
| `default` | `CardShell` | Standard card: header (title, status, actions) + the `view` body (§5). This is the fallback. |
| `ingest` | `IngestCard` | The current Evidence Intake / Gandalf-style chat card — title header plus a compact `GandalfChatPane`; **no** `view` body. |
| `postbox` | `PostboxCard` | A chat-only card — title header plus a compact `GandalfChatPane`; **no** `view` body. Used for conversational / ingest-style cards. |
| `strategist` | `StrategistCard` | A standard card body with its own shell implementation; keeps title/status/refresh but hides the header chat and inspect buttons. |

### Example match rules (illustrative only — NOT the contract)

The built-in defaults in
[src/lib/cardPresentationConfig.js](src/lib/cardPresentationConfig.js) happen to
key off `meta.card_renderer`, but a different board/template can use entirely
different conditions. Treat the following as sample wiring, not as flags you
can rely on:

```text
# example pane rules
gandalf   when  meta.gandalf = true
truthset  when  meta.truthset = true

# example renderer rules (top-down, first match wins)
strategist   when  meta.card_renderer = 'strategist'
ingest   when  meta.card_renderer = 'ingest'
postbox   when  meta.card_renderer = 'postbox'
default   (fallback)
```

---

## 5. View kinds (`view.elements[].kind`)

Each element resolves its data and feeds a renderer. The kind → component map is
the registry of cardview entries under
[src/components/registry/cardview/](src/components/registry/cardview/), resolved
by [src/components/renderers/CardviewRenderer.jsx](src/components/renderers/CardviewRenderer.jsx)
and [src/components/registry/engine/NodeRenderer.jsx](src/components/registry/engine/NodeRenderer.jsx).

| kind | Editable | Notes |
| --- | --- | --- |
| `table` | no | Array of row objects. |
| `editable-table` | yes | Needs `data.writeTo`. |
| `chart` | no | recharts; `data.chartType` + `columns`. |
| `metric` | no | Single hero number/string. |
| `list` | no | Array or key/value object. |
| `text` | no | Stringifiable; `format: "file-links"` supported. |
| `badge` | no | Colored pill; see `colorMap` below. |
| `alert` | no | Threshold-colored; see `thresholds` below. |
| `narrative` | no | Prose string. |
| `markdown` / `markup` | no | Markdown string (both map to `MarkdownView`). |
| `form` | yes | Object of field values; needs `writeTo`. |
| `searchbox` | yes | Single field; needs `writeTo`. (legacy `query` → `searchbox`) |
| `selection` | yes | Single selected value; needs `writeTo`. |
| `notes` | yes | Notes string; needs `writeTo`. |
| `todo` | yes | `[{ text, done }]`; needs `writeTo`. |
| `actions` | no | Buttons emit save events keyed by `button.id`. |

Legacy normalization (`normalizeLegacyKind`): `query` → `searchbox`; `filter` is
expanded into a `selection`/`searchbox` form.

> Editable kinds without `data.writeTo` drop edits silently.

### Per-kind `data.*` options

These authored `data.*` keys become the component's `spec` (the engine resolves
`data.bind` to the value and routes the rest into `spec`; see
[NodeRenderer.jsx](../src/components/registry/engine/NodeRenderer.jsx) and
[CardviewRenderer.jsx](../src/components/renderers/CardviewRenderer.jsx)).

The options below are the knobs each renderer honors. Anything not listed is
ignored. `data.bind` (the source path) and `data.writeTo` (the save path) apply
to every element; see §10 for bind namespaces.

| kind | Options it honors | Defaults / notes |
| --- | --- | --- |
| `table` | `columns`, `maxRows`, `sortable`, `placeholder` | `maxRows` 200; `sortable` true; `placeholder` "No data". |
| `editable-table` | `columns`, `schema.properties`, `addRow`, `deleteRow`, `placeholder`, `writeTo` | `addRow`/`deleteRow` true; `placeholder` "No rows". |
| `chart` | `chartType`, `columns`, `series`, `stacked`, `legend`, `grid`, `height`, `labelKey`/`xKey` | `height` 220; `legend`/`grid` true; `stacked` false; accepts row arrays or Chart.js `{labels,datasets}`. |
| `metric` | the bound value is a number/string | label from `element.label`. |
| `list` | `maxRows`, `placeholder` | `placeholder` "Empty". |
| `text` | `format`, `style`, `hideIfEmpty` | `format`: `default`\|`file-links`; `style`: `default`\|`heading`\|`muted`\|`muted-italic`. |
| `badge` | `colorMap` | value → tone keyword (see below). |
| `alert` | `thresholds` | `{green, amber}` threshold exprs (see below). |
| `narrative` | (none) | reads `data.text` or stringifies data. |
| `markdown` / `markup` | (none) | reads `data.text` or stringifies data. |
| `form` | `fields.properties`, `fields.required`, `saveLabel`, `discardLabel`, `writeTo` | field `type`: string/number/integer/boolean; `format: "date"` → date picker. |
| `searchbox` | `fields.properties` (single field), `actionLabel`, `writeTo` | `actionLabel` "Search". |
| `selection` | `fields.properties` (single field), `writeTo` | options from enum or bound row source. |
| `notes` | `writeTo` | content is a single string. |
| `todo` | `writeTo` | data is `[{ text, done }]`. |
| `actions` | `buttons: [{ id, label, style, size, disabled }]` | `style` "outline-secondary"; `size` "sm"; `label` defaults to `id`. |

Common element-level fields (not under `data`): `element.id`, `element.label`,
`element.kind`, `element.className` (default `col-12`), `element.containerStyle`,
`element.visible` (a bind-path gating render on truthiness). See §10.

### Badge tone (`data.colorMap`)

For `kind: "badge"`, `data.colorMap` maps a value to a tone keyword
(`green` / `amber` / `red`, or any tone alias from §3). The value's pill uses the
matching `--status-color`.

### Alert thresholds (`data.thresholds`)

For `kind: "alert"`, `data.thresholds` (e.g. `{ green: "<10", amber: "<20" }`)
selects the tone by comparing the numeric value (parsed by `parseThreshold` /
`evalThreshold` in `src/components/registry/lib/threshold.js`). Supported comparison operators:
`<`, `<=`, `>`, `>=`, `=`, `==`, `===`. Resolution order: green → amber → red
(default).

---

## 6. Watch-party streams (transient)

Live progress streamed over SSE to the UI; **never persisted**. Keyed by a
card-scoped `log_id`. Two channels:

| Channel | Carries |
| --- | --- |
| `agent-output` | The agent's stdout / model output stream for a turn. |
| `agent-tools` | Structured MCP tool invocation events made during the turn. Native payload fields currently include `tool`, `action`, and when available `card_id`, `turn_id`, `file_idx`. |

The backend source_def handlers
(`copilot-source-handler.js`, `foundry-handler.js`) emit `agent-tools` only when
`log_id` is present; the chat path passes it automatically, and the handlers
derive it from the card id.

---

## 7. App config (`app-config.json`)

Global, deployment-level knobs loaded by
[src/lib/appConfig.js](src/lib/appConfig.js) from
`${BASE_URL}app-config.json`, merged over `FALLBACK_APP_CONFIG`. A user override
may also be stored in `localStorage` under `demo-boards.app-config.override`
(version 1).

| Key | Default | Purpose |
| --- | --- | --- |
| `defaultBoardId` | `live` | Board loaded on startup. |
| `defaultBoard.label`, `defaultBoard.subtitle` | `Live` / (default subtitle) | Startup board presentation. The resolved board id still comes from `defaultBoardId`. |
| `refreshAllIntervalSeconds` | `1800` | Auto-refresh-all interval (legacy `refreshAllIntervalMs` accepted). |
| `transportMode` | `server-url` | `server-url` or `inbrowser` (aliases: `in-browser`, `inbrowser-firestore`, `inbrowser+firestore`). |
| `serverOrigin` | `http://localhost:7799` | Board server base URL (trailing slashes stripped). |
| `canvasLayout.defaultCardWidth` | `360` | Default card width (px). |
| `canvasLayout.defaultCardHeight` | `240` | Default card height (px). |
| `canvasLayout.columnGap` | `420` | Horizontal gap between columns (px). |
| `canvasLayout.rowGap` | `280` | Vertical gap between rows (px). |
| `canvasLayout.origin.{x,y}` | `40` / `40` | Canvas origin offset. |
| `storage.adapter` | `firestore` | `firestore` or `localstorage`. |
| `storage.firestore.{firebaseConfig,appName,refs}` | `{}` / `''` / `{}` | Firestore wiring. |
| `storage.localstorage.refs` | `{}` | LocalStorage board refs. |
| `boardServerConstants.agentOutputChannel` | `agent-output` | SSE channel name (§6). |
| `boardServerConstants.agentToolsChannel` | `agent-tools` | SSE channel name (§6). |

Resolved exports: `CANVAS_LAYOUT_CONFIG`, `BOARD_TRANSPORT_MODE`, `SERVER`,
`STORAGE_CONFIG`, `BOARD_SERVER_CONSTANTS`, `AGENT_OUTPUT_CHANNEL`,
`AGENT_TOOLS_CHANNEL`, plus derived `PAGE_TITLE` / `PAGE_SUBTITLE`.

> Runtime nuance: `appConfig.js` derives `PAGE_TITLE` and `PAGE_SUBTITLE` from
> `defaultBoard.label` and `defaultBoard.subtitle`. Standalone input keys named
> `pageTitle` / `pageSubtitle` appear in the fallback object and in some modal /
> manage-board flows, but the runtime app-config normalizer does not treat them
> as authoritative inputs.

---

## 8. Board UI config (board `ui.*`)

Per-board configuration resolved by
[src/hooks/useManagedBoardConfig.js](src/hooks/useManagedBoardConfig.js) (from the
server's manage-boards `get-board` / `get-layout`). This is where pane and
renderer **match rules** are defined — they override the defaults in
`cardPresentationConfig.js`.

| Key | Shape | Purpose |
| --- | --- | --- |
| `board.ui.paneRules` | array of `{ pane\|name, when }` | Pane routing rules (§4). |
| `board.ui.cardRendererRules` | array of `{ renderer\|name, when }` **or** object map `{ rendererName: whenExpr }` | Renderer selection rules (§4). |
| `board.metadata` | object | Normalized but not actively consumed (reserved). |
| `layout.canvas` | object | Persisted layout state (§9). |

### Rule shapes (`cardPresentationConfig.js`)

- A **pane rule** is `{ pane: "name", when: <expr|fn> }` (`name` accepted as an
  alias for `pane`). `when` may be a JSONata string (§11) or a predicate
  function `(cardState) => boolean`. A `null`/absent `when` always matches.
- A **renderer rule** is `{ renderer: "name", when: <expr|fn> }` (`name` alias),
  or a plain string `"name"` (always matches), or an object map entry
  `{ "name": "whenExpr" }`.
- **Defaults** when a board supplies none: `DEFAULT_PANE_RULES` and
  `DEFAULT_CARD_RENDERER_RULES` (the example wiring shown in §4). Renderer rules
  evaluate top-down, first match wins, falling back to `default`.

---

## 9. Layout & persistence knobs

Initial placement is computed by
[src/lib/boardCanvasLayout.js](src/lib/boardCanvasLayout.js) from the dependency
graph + `meta.presentation.*` (§1) + the app `canvasLayout` config (§7). Live
drag/resize is runtime-owned and persisted separately from card definitions.

| Knob | Where | Meaning |
| --- | --- | --- |
| `FOOTPRINT_WIDTH` | `boardCanvasLayout.js` | footprint → px (compact 300 / standard 360 / wide 440 / large 520). |
| `PROMINENCE_ORDER` | `boardCanvasLayout.js` | prominence → ordering weight (spotlight 0 / feature 1 / standard 2 / glance 3). |
| `view.layout.canvas.h` | card (legacy) | Card height hint when no stored size exists. |
| `layout.canvas.positions[cardId]` | persisted layout | `{x, y}` per card. |
| `layout.canvas.widths[cardId]` | persisted layout | width override (px) per card. |
| `layout.canvas.cardIds` / `viewport` | persisted layout | card list / viewport (viewport reserved). |
| `MIN_CARD_WIDTH` / `MAX_CARD_WIDTH` | `CardShell.jsx` | resize clamp (280 / 960 px). |
| autosave delay | `useCoordsState.jsx` | `30_000` ms debounce for layout persistence. |

Layout cache (`src/lib/boardLayoutCache.js`) stores per-board layout in
`localStorage` under `demo-board:layout-cache:{boardId}`; layout debug logging is
gated by `demo-board:layout-debug` (`'1'`/`'true'`) or
`window.__DEMO_BOARD_LAYOUT_DEBUG__`. Coordinate setters from the
`BoardCoordsProvider` context: `setCoords`, `setManyCoords`, `setWidth`.

---

## 10. Card definition structure & bind namespaces

What the UI reads off a card definition (beyond `meta.*` in §0). Fields not
listed are consumed by the board server, not the UI.

| Field | UI behavior |
| --- | --- |
| `id` | Card identifier. |
| `meta` | Card flags (§0–§4). |
| `view.elements[]` | Element definitions rendered by the cardview registry (§5). |
| `view.layout.canvas` | Legacy layout override (§9). |
| `requires` | Upstream token dependencies; available as the `requires.*` bind namespace and surfaced as token badges / inspect metadata on the canvas/backface. |
| `provides` | Published tokens (array of `{ bindTo }` or strings); surfaced as token badges / inspect metadata and used by graph/layout code. |
| `source_defs` | Data-source defs — **not** consumed by the UI (board server only). |
| `compute` | Computed-value defs — **not** consumed by the UI (board server only). |
| `card_data` | Persistent, **user-owned** data read/written by editable views (`writeTo`). |

### Bind namespaces (for `data.bind` and ref/view resolution)

Expressions resolve against these roots:

- `boardId` — current board id
- `card.*` — card definition fields
- `card_data.*` — persisted, user-owned card data
- `requires.*` — upstream provided tokens (e.g. `requires.token_name`)
- `computed_values.*` — runtime-computed values
- `runtime_state.*` — card runtime state

`element.visible` is **not** JSONata; it is a plain bind path resolved via the
same namespace lookup used by `data.bind`, and it renders the element when the
resolved value is truthy.

---

## 11. Filter expression syntax (`when`)

Pane/renderer `when` strings are **JSONata** expressions,
compiled by [src/lib/cardFilterExpression.js](src/lib/cardFilterExpression.js) via
`yaml-flow/compute-jsonata` (`evaluateSync`) and evaluated against the card's
`cardContent`.

- Equality / comparison: `=`, `==`, `===`, `<`, `<=`, `>`, `>=`
- Boolean logic: `and`, `or`
- Path / array access: `meta.path_state`, `source_defs[0].kind`, `items[0]`
- A rule matches only when the result is **strictly `=== true`** (any other
  value, or a thrown error, fails the match silently).

> Because `when` is full JSONata over `cardContent`, the example `meta.*`
> conditions in §4 are just conventions — a board can match on any field it wants.

---

## Where each fact comes from (file map)

- App config: [src/lib/appConfig.js](src/lib/appConfig.js)
- Board UI config: [src/hooks/useManagedBoardConfig.js](src/hooks/useManagedBoardConfig.js)
- Presentation weights/widths + layout: [src/lib/boardCanvasLayout.js](src/lib/boardCanvasLayout.js)
- Layout persistence / coords: [src/hooks/useCoordsState.jsx](src/hooks/useCoordsState.jsx), [src/lib/boardLayoutCache.js](src/lib/boardLayoutCache.js)
- Path-state defs + status tone mapping + width bounds: [src/components/CardShell.jsx](src/components/CardShell.jsx)
- Path-state + tone CSS: [src/theme.css](src/theme.css)
- Pane/renderer rules: [src/lib/cardPresentationConfig.js](src/lib/cardPresentationConfig.js), [src/components/CardRenderer.jsx](src/components/CardRenderer.jsx)
- Filter syntax: [src/lib/cardFilterExpression.js](src/lib/cardFilterExpression.js)
- View kinds + element options: [src/components/registry/cardview/](src/components/registry/cardview/), [src/components/renderers/CardviewRenderer.jsx](src/components/renderers/CardviewRenderer.jsx)
- Authoring guidance (backend): `demo-board/server/chat-flow/instructions/agent-instructions-2-cardlayout.md`, `demo-board/server/chat-flow/skills/manage-cards-on-live-board/SKILL.md`

> Keep this doc in sync when you change `appConfig.js`, `useManagedBoardConfig.js`,
> `boardCanvasLayout.js`, `useCoordsState.jsx`, `CardShell.jsx`,
> `cardPresentationConfig.js`, `cardFilterExpression.js`, the cardview registry
> (`registry/cardview/*`, `CardviewRenderer.jsx`, `NodeRenderer.jsx`), or
> the path-state / tone CSS.
