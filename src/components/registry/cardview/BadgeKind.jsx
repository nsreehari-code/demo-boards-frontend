import React from 'react';
import { Badge } from '../../shared/Badge.jsx';

export function BadgeKind({ spec = {}, data }) {
  const colorMap = spec.colorMap ?? {};
  const value = data != null ? String(data) : '';
  return <Badge value={value} tone={colorMap[value] ?? 'secondary'} />;
}
