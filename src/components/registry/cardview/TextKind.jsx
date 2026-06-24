import React from 'react';
import { Text } from '../../shared/Text.jsx';

// Default text renderer and the registry fallback kind. Reads all config from
// `spec`; file links resolve through the injected `services.fileUrlForIndex`.
export function TextKind({ spec = {}, data, services }) {
  return (
    <Text
      value={data}
      format={spec.format ?? 'default'}
      style={spec.style ?? 'default'}
      hideIfEmpty={spec.hideIfEmpty}
      resolveFileUrl={services?.fileUrlForIndex}
    />
  );
}
