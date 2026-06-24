import React from 'react';
import { Table } from '../../shared/Table.jsx';

export function TableKind({ spec = {}, data }) {
  return (
    <Table
      data={data}
      columns={spec.columns}
      maxRows={spec.maxRows ?? 200}
      sortable={spec.sortable !== false}
      placeholder={spec.placeholder ?? 'No data'}
    />
  );
}
