import { pathParts, deepGet } from './path.js';

// Resolves a bind expression ("namespace.path.to.value") against the supplied
// namespaces. The engine owns binding so components stay bind-agnostic.
export function resolveBind(namespaces, bind) {
  if (!bind || typeof bind !== 'string') return undefined;
  const parts = pathParts(bind);
  if (!parts.length) return undefined;

  const root = parts[0];
  const rest = parts.slice(1).join('.');

  if (!namespaces || !(root in namespaces)) return undefined;
  return rest ? deepGet(namespaces[root], rest) : namespaces[root];
}
