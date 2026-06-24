import React from 'react';
import { Metric } from '../../shared/Metric.jsx';

// `metric` suppresses the engine frame label (entry.meta.showLabel: false) and
// uses the instance `meta.label` as the title. Data is a scalar value.
export function MetricKind({ meta = {}, data }) {
  return <Metric title={meta.label ?? ''} value={data != null ? String(data) : '—'} />;
}
