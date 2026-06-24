import React from 'react';
import { Narrative } from '../../shared/Narrative.jsx';

export function NarrativeKind({ data }) {
  return (
    <Narrative
      text={typeof data === 'string' ? data : ''}
      emptyMessage="No narrative yet. Click refresh to generate."
    />
  );
}
