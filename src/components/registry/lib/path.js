// Pure path utilities shared by bind resolution and the save lifecycle.

export function pathParts(path) {
  if (!path || typeof path !== 'string') return [];
  return path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
}

export function deepGet(source, path) {
  if (!path || !source) return undefined;
  let current = source;
  for (const part of pathParts(path)) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
}

export function deepSet(target, path, value) {
  const parts = pathParts(path);
  if (!parts.length) return target;
  const next = Array.isArray(target) ? [...target] : { ...(target ?? {}) };
  let current = next;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    const existing = current[part];
    current[part] = Array.isArray(existing) ? [...existing] : { ...(existing ?? {}) };
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;
  return next;
}
