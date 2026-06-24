import React, { useCallback, useMemo } from 'react';
import { Form as SharedForm } from '../../shared/Form.jsx';

export function FormKind({ spec = {}, meta = {}, data, currentValue, writeTo, onSave }) {
  const baseValues = useMemo(() => (
    data && typeof data === 'object' && !Array.isArray(data)
      ? { ...data }
      : (currentValue && typeof currentValue === 'object' && !Array.isArray(currentValue)
        ? { ...currentValue }
        : {})
  ), [data, currentValue]);

  const handleSave = useCallback((values) => {
    onSave?.(values, { kind: 'form', writeTo });
  }, [onSave, writeTo]);

  return (
    <SharedForm
      spec={spec}
      baseValues={baseValues}
      idPrefix={meta.id ?? 'field'}
      onSave={handleSave}
    />
  );
}
