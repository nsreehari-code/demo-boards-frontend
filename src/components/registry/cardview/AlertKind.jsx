import React from 'react';
import { Alert } from '../../shared/Alert.jsx';
import { evalThreshold } from '../lib/threshold.js';

// `alert` suppresses the engine frame label (entry.meta.showLabel: false) and
// renders the instance `meta.label` inline.
export function AlertKind({ spec = {}, meta = {}, data }) {
  const thresholds = spec.thresholds ?? {};
  const value = typeof data === 'number' ? data : null;

  let level = 'unknown';
  if (value != null) {
    if (thresholds.green && evalThreshold(value, thresholds.green)) level = 'green';
    else if (thresholds.amber && evalThreshold(value, thresholds.amber)) level = 'amber';
    else level = 'red';
  }

  return <Alert value={value} label={meta.label} level={level} />;
}
