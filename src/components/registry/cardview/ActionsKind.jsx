import React from 'react';
import { Actions } from '../../shared/Actions.jsx';

export function ActionsKind({ spec = {}, meta = {}, onSave }) {
  const id = meta.id;
  return (
    <Actions
      buttons={spec.buttons ?? []}
      onAction={(buttonId) => onSave?.(null, { kind: 'actions', buttonId, elemId: id })}
    />
  );
}
