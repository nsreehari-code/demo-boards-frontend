// Equality + the registry-level coercion used when data falls through to the
// fallback kind.

export function deepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function coerceUnknownData(data) {
  if (typeof data === 'string') return data;
  return data != null ? JSON.stringify(data, null, 2) : '';
}
