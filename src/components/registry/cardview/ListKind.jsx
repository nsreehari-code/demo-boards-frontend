import React from 'react';
import { List } from '../../shared/List.jsx';

export function ListKind({ spec = {}, data }) {
  return (
    <List
      data={data}
      columns={spec.columns}
      maxRows={spec.maxRows}
      sortable={spec.sortable !== false}
      placeholder={spec.placeholder ?? 'Empty'}
      tablePlaceholder={spec.placeholder ?? 'No data'}
    />
  );
}
