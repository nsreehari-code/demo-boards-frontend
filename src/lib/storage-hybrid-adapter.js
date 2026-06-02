import { STORAGE_ADAPTER_LOCALSTORAGE } from './appConfig.js';
import { getRefKind, resolveBoardRefs } from './board-refs.js';

function collectRefKinds(refs) {
  const kinds = new Set();
  if (refs?.baseRef?.kind) kinds.add(refs.baseRef.kind);
  for (const key of Object.keys(refs ?? {})) {
    if (key === 'baseRef') continue;
    const kind = getRefKind(refs[key]);
    if (kind) kinds.add(kind);
  }
  return kinds;
}

function needsFirestore(refKinds, primaryKind) {
  return primaryKind === 'firestore'
    || primaryKind === 'firestore-board'
    || primaryKind === 'firebase-storage'
    || refKinds.has('firestore')
    || refKinds.has('firestore-board')
    || refKinds.has('firebase-storage');
}

function needsLocalStorage(refKinds, primaryKind) {
  return primaryKind === 'local-storage' || refKinds.has('local-storage');
}

function pickPrimaryKind(storageConfig, refs) {
  if (refs?.baseRef?.kind) return refs.baseRef.kind;
  return storageConfig?.adapter === STORAGE_ADAPTER_LOCALSTORAGE ? 'local-storage' : 'firestore';
}

function makeHybridAdapter(primaryAdapter, localBundle, firestoreBundle) {
  function pickAdapterForRef(ref) {
    const kind = getRefKind(ref) || ref?.kind || '';
    if (kind === 'local-storage' && localBundle) return localBundle.boardAdapter;
    if ((kind === 'firestore' || kind === 'firestore-board' || kind === 'firebase-storage') && firestoreBundle) {
      return firestoreBundle.boardAdapter;
    }
    return primaryAdapter;
  }

  return {
    kvStorage(namespace) {
      return primaryAdapter.kvStorage(namespace);
    },
    kvStorageForRef(ref) {
      return pickAdapterForRef(ref).kvStorageForRef(ref);
    },
    blobStorage(namespace) {
      return primaryAdapter.blobStorage(namespace);
    },
    scratchStorage() {
      return primaryAdapter.scratchStorage();
    },
    scratchStorageForRef(ref) {
      return pickAdapterForRef(ref).scratchStorageForRef(ref);
    },
    archiveFactory() {
      return primaryAdapter.archiveFactory();
    },
    archiveFactoryForRef(ref) {
      return pickAdapterForRef(ref).archiveFactoryForRef(ref);
    },
    journalStorage() {
      return primaryAdapter.journalStorage();
    },
    boardWorkerStore() {
      return primaryAdapter.boardWorkerStore();
    },
    chatAgentStore() {
      return primaryAdapter.chatAgentStore();
    },
    processAccumulatedStore() {
      return primaryAdapter.processAccumulatedStore();
    },
    lock: primaryAdapter.lock,
    get callbackTransport() {
      return primaryAdapter.callbackTransport;
    },
    set callbackTransport(value) {
      primaryAdapter.callbackTransport = value;
    },
    dispatchExecution(ref, args) {
      return primaryAdapter.dispatchExecution(ref, args);
    },
    supportsDirectSourceOutput: primaryAdapter.supportsDirectSourceOutput
      ? (ref) => primaryAdapter.supportsDirectSourceOutput(ref)
      : undefined,
    resolveBlob(ref) {
      return pickAdapterForRef(ref).resolveBlob(ref);
    },
    hashFn(value) {
      return primaryAdapter.hashFn(value);
    },
    genId() {
      return primaryAdapter.genId();
    },
    requestProcessAccumulated: primaryAdapter.requestProcessAccumulated
      ? () => primaryAdapter.requestProcessAccumulated()
      : undefined,
    publishBoardChangeNotifications: primaryAdapter.publishBoardChangeNotifications
      ? (notifications) => primaryAdapter.publishBoardChangeNotifications(notifications)
      : undefined,
    warn: primaryAdapter.warn
      ? (msg) => primaryAdapter.warn(msg)
      : undefined,
  };
}

async function createLocalBundle(boardId, refs, runtimeHooks) {
  const api = globalThis.LocalStorageStorage;
  if (!api?.createLocalStorageBoardRuntimeBundle) {
    throw new Error('yaml-flow localstorage-storage browser bundle is not loaded');
  }
  return api.createLocalStorageBoardRuntimeBundle(boardId, {
    refs,
    requestProcessAccumulated: runtimeHooks?.requestProcessAccumulated,
    publishBoardChangeNotifications: runtimeHooks?.publishBoardChangeNotifications,
  });
}

async function createFirestoreBundle(boardId, storageConfig, refs, runtimeHooks) {
  const mod = await import('./storage-firestore-adapter.js');
  return mod.createStorageAdapter(boardId, {
    ...(storageConfig?.firestore || {}),
    refs,
  }, runtimeHooks);
}

export async function createStorageAdapter(boardId, storageConfig = {}, runtimeHooks = {}) {
  const activeConfig = storageConfig?.adapter === STORAGE_ADAPTER_LOCALSTORAGE
    ? storageConfig?.localstorage || {}
    : storageConfig?.firestore || {};
  const refs = resolveBoardRefs(boardId, activeConfig.refs);
  const primaryKind = pickPrimaryKind(storageConfig, refs);
  const refKinds = collectRefKinds(refs);

  const localBundle = needsLocalStorage(refKinds, primaryKind)
    ? await createLocalBundle(boardId, refs, runtimeHooks)
    : null;
  const firestoreBundle = needsFirestore(refKinds, primaryKind)
    ? await createFirestoreBundle(boardId, storageConfig, refs, runtimeHooks)
    : null;

  const primaryBundle = primaryKind === 'local-storage'
    ? localBundle
    : firestoreBundle;

  if (!primaryBundle) {
    throw new Error(`No primary bundle available for hybrid adapter kind "${primaryKind}"`);
  }

  return {
    refs: primaryBundle.refs,
    boardAdapter: makeHybridAdapter(primaryBundle.boardAdapter, localBundle, firestoreBundle),
  };
}