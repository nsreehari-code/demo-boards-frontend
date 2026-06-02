const REF_PREFIX = 'b64:';

export const BOARD_REF_FIELDS = Object.freeze([
  'cardStoreRef',
  'outputsStoreRef',
  'scratchStoreRef',
  'archiveStoreRef',
  'chatStoreRef',
  'artifactsStoreRef',
]);

function toBase64Url(raw) {
  const utf8 = new TextEncoder().encode(raw);
  let base64 = '';
  if (typeof Buffer !== 'undefined') {
    base64 = Buffer.from(utf8).toString('base64');
  } else if (typeof btoa === 'function') {
    let binary = '';
    for (const byte of utf8) binary += String.fromCharCode(byte);
    base64 = btoa(binary);
  } else {
    throw new Error('No base64 encoder available in this runtime');
  }
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(input) {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/')
    + '='.repeat((4 - (input.length % 4)) % 4);
  if (typeof Buffer !== 'undefined') return Buffer.from(base64, 'base64').toString('utf8');
  if (typeof atob === 'function') {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new TextDecoder().decode(bytes);
  }
  throw new Error('No base64 decoder available in this runtime');
}

export function serializeKindValueRef(ref) {
  return `${REF_PREFIX}${toBase64Url(JSON.stringify(ref))}`;
}

export function parseSerializedRef(ref) {
  if (typeof ref !== 'string' || !ref.startsWith(REF_PREFIX)) {
    throw new Error(`Invalid ref format: ${String(ref)}`);
  }
  const parsed = JSON.parse(fromBase64Url(ref.slice(REF_PREFIX.length)));
  if (!parsed || typeof parsed !== 'object' || typeof parsed.kind !== 'string' || typeof parsed.value !== 'string') {
    throw new Error(`Invalid ref payload: ${String(ref)}`);
  }
  return { kind: parsed.kind, value: parsed.value };
}

export function tryParseKindValueRef(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (!trimmed.startsWith(REF_PREFIX)) return null;
    try {
      return parseSerializedRef(trimmed);
    } catch {
      return null;
    }
  }
  if (typeof value === 'object') {
    const kind = typeof value.kind === 'string' ? value.kind.trim() : '';
    const refValue = typeof value.value === 'string' ? value.value.trim() : '';
    if (kind && refValue) return { kind, value: refValue };
  }
  return null;
}

function normalizeStoreRefConfig(value) {
  if (typeof value === 'string' && value.trim()) {
    const trimmed = value.trim();
    if (trimmed.startsWith(REF_PREFIX)) {
      const parsed = tryParseKindValueRef(trimmed);
      return parsed ? serializeKindValueRef(parsed) : undefined;
    }
    return trimmed;
  }
  const parsed = tryParseKindValueRef(value);
  return parsed ? serializeKindValueRef(parsed) : undefined;
}

export function normalizeBoardRefsConfig(config) {
  const source = config && typeof config === 'object' ? config : {};
  const refs = {};
  const baseRef = tryParseKindValueRef(source.baseRef);
  if (baseRef) refs.baseRef = baseRef;
  for (const field of BOARD_REF_FIELDS) {
    const normalized = normalizeStoreRefConfig(source[field]);
    if (normalized) refs[field] = normalized;
  }
  return refs;
}

function replaceBoardTemplate(value, boardId) {
  return String(value).replace(/\{\{\s*boardId\s*\}\}/g, String(boardId));
}

export function resolveBoardRefs(boardId, refsConfig) {
  const source = refsConfig && typeof refsConfig === 'object' ? refsConfig : null;
  if (!source) return undefined;

  const refs = {};
  const baseRef = tryParseKindValueRef(source.baseRef);
  if (baseRef) {
    refs.baseRef = {
      kind: baseRef.kind,
      value: replaceBoardTemplate(baseRef.value, boardId),
    };
  }
  for (const field of BOARD_REF_FIELDS) {
    const normalized = normalizeStoreRefConfig(source[field]);
    if (!normalized) continue;
    const parsed = tryParseKindValueRef(normalized);
    refs[field] = parsed
      ? serializeKindValueRef({ kind: parsed.kind, value: replaceBoardTemplate(parsed.value, boardId) })
      : replaceBoardTemplate(normalized, boardId);
  }
  return Object.keys(refs).length > 0 ? refs : undefined;
}

export function getRefKind(value) {
  return tryParseKindValueRef(value)?.kind ?? '';
}