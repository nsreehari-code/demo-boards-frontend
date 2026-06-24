// Barrel of card-view (Tier 1) registry entries. Each cardview/*Kind.jsx file
// exports ONLY its render component (the thin adapter over a shared/* presenter);
// the kind → component → meta wiring lives here so per-kind boilerplate stays
// out of the component files and registry.js stays pure aggregation.

import { TableKind } from './TableKind.jsx';
import { ListKind } from './ListKind.jsx';
import { ChartKind } from './ChartKind.jsx';
import { MetricKind } from './MetricKind.jsx';
import { AlertKind } from './AlertKind.jsx';
import { BadgeKind } from './BadgeKind.jsx';
import { NarrativeKind } from './NarrativeKind.jsx';
import { TextKind } from './TextKind.jsx';
import { ActionsKind } from './ActionsKind.jsx';
import { SelectionKind } from './SelectionKind.jsx';
import { SearchboxKind } from './SearchboxKind.jsx';
import { FormKind } from './FormKind.jsx';
import { NotesKind } from './NotesKind.jsx';
import { EditableTableKind } from './EditableTableKind.jsx';
import { TodoKind } from './TodoKind.jsx';
import { MarkdownKind } from './MarkdownKind.jsx';
import { resolveChartVariant } from '../lib/chart.js';

// Shared meta presets (engine framing + interaction model).
const READ_ONLY = { showLabel: true, isReadonly: true };   // labelled value display
const HEADLINE = { showLabel: false, isReadonly: true };   // self-titled tile (label inline)
const COMMIT = { showLabel: true, controlled: 'commit' };  // committed input control

export const cardViewEntries = [
  { kind: 'table', renderComponentFn: TableKind, meta: READ_ONLY },
  { kind: 'list', renderComponentFn: ListKind, meta: READ_ONLY },
  { kind: 'chart', renderComponentFn: ChartKind, defaultVariant: 'bar', resolveVariant: resolveChartVariant, meta: READ_ONLY },
  { kind: 'metric', renderComponentFn: MetricKind, meta: HEADLINE },
  { kind: 'alert', renderComponentFn: AlertKind, meta: HEADLINE },
  { kind: 'badge', renderComponentFn: BadgeKind, meta: READ_ONLY },
  { kind: 'narrative', renderComponentFn: NarrativeKind, meta: READ_ONLY },
  { kind: 'text', renderComponentFn: TextKind, meta: READ_ONLY },
  { kind: 'actions', renderComponentFn: ActionsKind, meta: { showLabel: true, isReadonly: false } },
  { kind: 'selection', renderComponentFn: SelectionKind, meta: COMMIT },
  // `query` and `searchbox` are two explicit kinds sharing one component.
  { kind: 'query', renderComponentFn: SearchboxKind, meta: COMMIT },
  { kind: 'searchbox', renderComponentFn: SearchboxKind, meta: COMMIT },
  { kind: 'form', renderComponentFn: FormKind, meta: COMMIT },
  { kind: 'notes', renderComponentFn: NotesKind, meta: COMMIT },
  { kind: 'editable-table', renderComponentFn: EditableTableKind, meta: COMMIT },
  { kind: 'todo', renderComponentFn: TodoKind, meta: COMMIT },
  // `markdown` and `markup` are two explicit kinds sharing one component.
  { kind: 'markdown', renderComponentFn: MarkdownKind, meta: READ_ONLY },
  { kind: 'markup', renderComponentFn: MarkdownKind, meta: READ_ONLY },
];
