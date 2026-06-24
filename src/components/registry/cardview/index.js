// Barrel of card-view (Tier 1) registry entries. Each cardview/*.jsx file
// exports its own `entry` descriptor (component + metadata); they are collected
// here so registry.js stays pure aggregation with no per-kind wiring.

import { entry as table } from './Table.jsx';
import { entry as list } from './List.jsx';
import { entry as chart } from './Chart.jsx';
import { entry as metric } from './Metric.jsx';
import { entry as alert } from './Alert.jsx';
import { entry as badge } from './Badge.jsx';
import { entry as narrative } from './Narrative.jsx';
import { entry as text } from './Text.jsx';
import { entry as actions } from './Actions.jsx';
import { entry as selection } from './Selection.jsx';
import { entry as query } from './QueryView.jsx';
import { entry as searchbox } from './Searchbox.jsx';
import { entry as form } from './Form.jsx';
import { entry as notes } from './Notes.jsx';
import { entry as editableTable } from './EditableTable.jsx';
import { entry as todo } from './Todo.jsx';
import { entries as markdownEntries } from './Markdown.jsx';

export const cardViewEntries = [
  table,
  list,
  chart,
  metric,
  alert,
  badge,
  narrative,
  text,
  actions,
  selection,
  query,
  searchbox,
  form,
  notes,
  editableTable,
  todo,
  ...markdownEntries,
];
