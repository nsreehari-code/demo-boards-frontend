# Four-Tier Component Registry — Source of Truth

Status: **LOCKED** (2026-06-24) — full N×N symmetry, one unified registry, no
artificial blockers. Implementation pending (Tier 1 first). Changes to this
contract require explicit re-opening; implementation is held to the conformance
bar below, not the reverse.

This document defines the declarative component-registry contract for the board
frontend. The goal is to represent the UI — boards, panes, cards, and card views
— as **data** (registry entries + instance nodes) interpreted by a small set of
resolvers, so that eventually an entire board can be driven by JSON.

## Tiers

| # | Tier | Container of | Representative components |
|---|------|--------------|---------------------------|
| 1 | **View** (`card-core-view`) | values | `ChartView`, `TableView`, `FormView`, … (`CARD_CORE_VIEW_KINDS`) |
| 2 | **Card** | a view-tree | `CardShell`, `StrategistCard`, `IngestCard` (`CardRenderer`) |
| 3 | **Pane** | cards | `CentrePane`, `GandalfPane`, `TruthsetExplorePane` |
| 4 | **Board** | panes | `MainBoard` |

The tier labels are **organizational groupings of registry entries**, not rigid
structural barriers. The contract is uniform and recursive (see the litmus test
at the end).

### No ladder — any kind in any slot

There is **no fixed board → pane → card → view ladder**. Any kind may occupy any
position: a `pane` may render a `chart` leaf directly (skipping the card tier), a
`card` may render a `board`, a view slot may host a pane. The four tiers above
describe *typical authoring*, not a typing rule the mechanism enforces. A slot
imposes **nothing** about its child's `kind`; the node's own `kind` is the sole
determinant of what renders there.

### One registry, not four

There is **a single unified registry keyed by `kind`**, shared across all tiers —
not one registry per tier. This is what makes the symmetry total instead of
conditional: because every kind lives in the same namespace, any kind is
addressable from any slot. Per-tier registries would re-introduce an artificial
blocker (a kind reachable only from its "own" tier), so they are prohibited.

### Only genuine constraints, never artificial ones

The mechanism never *forbids* a mapping. The only real limits are intrinsic and
are expressed as **graceful behavior**, never as a structural ban:

- **Data-fit** — a component needs its inputs. A poor fit (e.g. a `chart` bound
  to a scalar) resolves to `fallbackKind` / a dev box, never a crash and never a
  ban. Authoring tools may *warn*; they must not *prevent*.
- **Bounded recursion** — nesting is allowed but depth/cycle guarded.
- **Own context** — a stateful nested kind derives its own identity from `spec`.

Everything else — tier-typed slots, per-tier registries, per-tier dispatch,
slot-imposed framing, "children must be data-driven IDs" — is an **artificial
blocker** and is disallowed by this contract.

## Three orthogonal axes

Every entry is resolved along three independent axes. They must never be
conflated.

| Axis | Question | Hook | Scope | Depends on |
|------|----------|------|-------|------------|
| **kind** | which Component? | `resolveKind` | across entries | `(spec, data)` |
| **variant** | which sub-mode of it? | `resolveVariant` | within one entry | `(spec, data)` |
| **status** | what's happening now? | injected (not resolved) | per render | runtime |

- A **variant** must never swap the Component — if it would, it is a **kind**.
- **status** (`isLoading`/`isError`) is ephemeral runtime state. It is never
  declared in a static entry; it is injected by the resolver one tier up.

## Three lifetimes

| Lifetime | Changes? | Count | Lives in |
|----------|----------|-------|----------|
| **Type** | never | one per kind | registry entry |
| **Instance** | per board edit | one per element | the node (board JSON) |
| **Runtime** | every render | per instance, over time | injected by resolver |

## 1. Registry entry — type-level, static, one per kind

```js
{
  type: 'card-core-view',          // descriptive tag only — NOT a separate registry namespace
  kind: 'chart',                   // entry key (unique across the ONE unified registry)
  renderComponentFn,               // the controlled component

  requiredPropKeys: [],            // validation (a.k.a. `needs`)
  aliases: ['heatmap'],            // optional: static legacy names → this entry

  resolveKind:    (spec, data) => kindString | null,   // optional; cross-entry redirect ('filter')
  defaultVariant: 'bar',
  resolveVariant: (spec, data) => variantString,       // optional; within-entry submode (detectChartType)

  meta: { isReadonly: true, showLabel: true },         // static facts only
  specSchema: { /* shape + defaults for instance spec */ },  // optional
}
```

Registry-level (not per entry). There is exactly **one** such registry, shared by
all tiers and keyed by `kind`:

```js
{ fallbackKind: 'text', coerceUnknownData: (data) => string }
```

## 2. Container extension — any entry may be a container

Containment is **not a tier**. *Any* entry becomes a container by providing a
`childResolver` (or by a node supplying structural `children`); an entry with
neither is a leaf. Children carry their **own** `kind` and dispatch through the
**same** unified registry — there is no per-tier registry and no required
allow-list of child kinds.

```js
{
  ...entry,
  childResolver: (spec, state) => childNode[],         // data-driven enumeration
  childKinds?: ['pane', 'card', 'chart', ...],         // OPTIONAL authoring hint; defaults to ALL kinds.
                                                       // a WARNING surface only — never a structural ban.
}
```

**Two enumeration modes, identical dispatch.** Children may be listed two ways;
both produce nodes rendered by the same resolver:

- **Structural** — `node.children`: explicit nodes of *any* kind.
- **Data-driven** — `childResolver(spec, state)`: refs derived from state (e.g. a
  pane's filtered card-ID list).

Enumeration mode constrains **how children are listed**, never **which kinds** may
appear. A data-driven resolver naturally yields the entity it queries (a pane's
filter yields card IDs); to place a *different* kind beside them, add a structural
child. Neither path restricts the child's `kind`.

## 3. Instance (node) — config, per element, from board JSON

```js
{
  kind: 'chart',
  variant?: 'pie',                 // explicit override (wins over resolveVariant)
  spec: { chartType, height, columns, label, ... },   // the values
  bind?:    'computed_values.trend',                  // read path  (resolved → data)
  writeTo?: 'card_data.choice',                       // write path (→ onSave target)
  visible?: 'card_data.editable',                     // gate
  children?: Node[],               // structural only (board → panes)
}
```

## 4. Runtime — injected by the resolver each render

```jsx
<Component
  spec={node.spec}
  variant={resolvedVariant}
  data={resolvedData}                  // bind resolved over namespaces
  currentValue={resolvedWriteValue}    // for controlled-commit inputs
  onSave={(value, meta) => ...}        // meta carries { writeTo, kind, buttonId, elemId }
  status={{ isLoading, isError }}      // ephemeral, owned one tier up
  services={{ fileUrlForIndex, ... }}  // injected capabilities, not data
>
  {children}                           {/* container tiers only */}
</Component>
```

## 5. Resolver responsibilities (`CardCore` / `NodeRenderer`)

In order:

1. Evaluate `node.visible` → skip if false.
2. **kind**: `effectiveKind = entry.resolveKind?.(spec, data) ?? node.kind`; look up
   entry; alias / `fallbackKind` on miss → **visible dev fallback box** (never crash, never silent null).
3. **variant**: `variant = node.variant ?? entry.resolveVariant?.(spec, data) ?? entry.defaultVariant`.
4. Resolve `data` from `bind`; resolve `currentValue` from `writeTo`.
5. Validate `requiredPropKeys`; default spec via `specSchema`.
6. Inject `status` (from the tier-up hook) + `services`.
7. **Containers**: run `childResolver` (and/or read structural `node.children`),
   render each child through the **same** unified registry by its own `kind`.
8. Own framing (`meta.showLabel`), layout placement (`col-*`), React key, and the
   **save lifecycle** (pending / optimistic / round-trip via upstream signature).

Binding stays **out** of components: `data`/`onSave` are the resolved ends of
`bind`/`writeTo`. Components are bind-agnostic and controlled.

## 6. Per-tier instantiation

| Field | View (T1) | Card (T2) | Pane (T3) | Board (T4) |
|-------|-----------|-----------|-----------|------------|
| Component | `ChartView` | `CardShell`/`StrategistCard` | `CentrePane` | `MainBoard` |
| requiredPropKeys | — | `boardId, cardId` | `boardId` | `boardId` |
| resolveKind | `normalizeLegacyKind` | `resolveCardRenderer(state, rules)` | pane rules | `layout.kind` → Component |
| resolveVariant | `detectChartType` / `style` | compact/expanded | `infinite-canvas`/`flowing-cards` | pane arrangement |
| spec | `renderDef.data` | renderer kind, `enableResize` | `layoutStrategy`, filters, rules | pane composition |
| data | bound values | `cardState.cardContent` | filtered **card-ID list** | pane set |
| onSave | field/`card_data` | `cardActions.patch` | — | `save-layout`/`save-meta` |
| status (from) | `CardCore` | `useCardState` | `useBoardState` | `useManagedBoardConfig` + `App` |
| childResolver (enumeration) | — | (internal view-tree) | filter→card IDs (data-driven) | `spec.panes` (structural) |

## 7. The Card hinge

`Card` is **a leaf to its Pane** (rendered from one card ID) but **a container
internally** (`CardShell` → `CardCore` renders a view-tree). Its entry uses the
universal leaf shape outward while `CardCore` acts as the Tier-1 resolver inward.
It is the one tier that wears both hats.

## Invariants (hold at all four tiers)

- `resolveKind` (cross-entry) and `resolveVariant` (within-entry) are separate
  hooks, both `(spec, data) => string`.
- `status` is injected from one tier up, never declared statically.
- Components are bind-agnostic and controlled; the resolver owns binding,
  framing, keys, and the save lifecycle.
- Unknown kind → visible dev fallback, never a crash or silent null.

## Litmus test: is a board "just" another registry entry?

**Yes — by construction.** A board is just an entry that supplies a
`childResolver` (it is a container) and whose children happen to be panes:

```js
{
  type: 'card-core-view',
  kind: 'board',
  renderComponentFn: BoardComponent,
  requiredPropKeys: ['boardId'],
  meta: { isReadonly: true },
  childResolver: (spec, boardState) => spec.panes,   // children dispatch by their own `kind`
  childKinds: ['pane'],                              // OPTIONAL authoring hint only
}
```

The *same* dispatch that renders a `chart` renders a `board`; only the presence
of `childResolver` differs. To actually render a board **as a card-core kind**
(a nested board inside a card body) three things are required:

1. The Tier-1 resolver (`CardCore`) must honor the **container extension**
   (`childResolver` / structural `children`); today it renders leaves only.
2. The nested board gets its **own** `boardId` + its **own** state/status context
   (`useBoardState` / `useManagedBoardConfig`), independent of the parent card.
3. A **recursion guard** (board → card → board …) to prevent infinite nesting.

Nothing in the contract forbids it. The fact that a board reduces to a registry
entry with a `childResolver` is the proof that the four tiers share one uniform,
recursive mechanism.

### Conformance bar (hold the implementation to this)

The litmus test is **normative**, not illustrative. Any implementation of this
registry MUST satisfy all of the following. If a change breaks any item, the
change is non-conformant and must be reworked — not the contract.

1. **Uniform entry shape.** A board, pane, card, and view are all expressed with
   the *same* entry shape (§1) plus, for containers, the *same* extension (§2).
   No tier introduces a bespoke registration shape.
2. **One dispatch path.** A single resolver algorithm (§5) renders every tier.
   There is no tier-specific `switch` on `kind` outside `resolveKind`.
3. **Board-as-entry.** A board is registrable as an entry with a `childResolver`.
   Rendering a board requires no code path that a chart entry could not also use.
4. **Container extension is honored everywhere.** Any resolver that can render a
   leaf (including `CardCore`) MUST honor `childResolver` / structural
   `children`, so a container kind (e.g. `board`) can be nested inside any tier —
   including a card body — without new machinery.
5. **Own context per nested unit.** A nested container resolves its own
   identity, state, status, and save lifecycle (e.g. its own `boardId` +
   `useBoardState` / `useManagedBoardConfig`) — never borrowing the parent's.
6. **Recursion is bounded.** Nesting (board → card → board …) is permitted but
   guarded against infinite recursion (depth limit and/or cycle detection).
7. **Three axes stay orthogonal.** `resolveKind`, `resolveVariant`, and injected
   `status` remain independent; variant never swaps a Component, status never
   enters a static entry.
8. **No artificial blockers — any kind in any slot.** No slot may constrain its
   child's `kind`. There is no enforced tier ladder: `pane-as-chart`,
   `view-as-board`, `card-as-pane` and every other N×N combination are valid by
   construction. The only permitted limits are the genuine ones (data-fit via
   `fallbackKind`, bounded recursion, own context) — expressed as graceful
   behavior, never as a structural ban. Authoring tools may *warn*; they must
   never *prevent*.
9. **One unified registry; enumeration ≠ restriction.** All kinds live in a
   single registry keyed by `kind` (no per-tier registries). Structural vs
   data-driven children is only a *how-listed* distinction; it never restricts
   *which kind* may appear in a slot.

**Acceptance check.** The mechanism is conformant when every one of these renders
through only the generic resolver, with no kind-specific or tier-specific code
path:

- a `board` authored as JSON (`{ kind: 'board', childResolver }`) at the top
  level **and** nested inside a card body;
- a `pane` that renders a `chart` leaf directly (no intervening card);
- a `card` that renders a nested `board`;
- a view slot that hosts a `pane`.

If any of these requires bespoke machinery, an artificial blocker has crept in
and the change is non-conformant.
