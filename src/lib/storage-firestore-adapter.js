/**
 * storage-firestore-adapter.js
 *
 * Host-app composition: initialize Firebase, then hand the Firestore handle to
 * yaml-flow's firestore-storage adapter. Blobs live in Firestore for now; a
 * mixed Firebase-Storage adapter can be added explicitly when needed.
 *
 * `config` shape (firestore variant):
 *   {
 *     firebaseConfig: { apiKey, projectId, ... },
 *     appName?: string,
 *   }
 */

import { resolveBoardRefs } from './board-refs.js';
import { getFirebaseServices } from './firebase-app.js';

export async function createStorageAdapter(boardId, config = {}, runtimeHooks = {}) {
  const firestoreApi = globalThis.FirestoreStorage;
  if (!firestoreApi?.createFirestoreBoardRuntimeBundle) {
    throw new Error('yaml-flow firestore-storage browser bundle is not loaded');
  }

  const firebaseServices = await getFirebaseServices(config);
  const { refs, boardAdapter } = firestoreApi.createFirestoreBoardRuntimeBundle(
    firebaseServices.firestore,
    boardId,
    {
      refs: resolveBoardRefs(boardId, config?.refs),
      requestProcessAccumulated: runtimeHooks.requestProcessAccumulated,
      publishBoardChangeNotifications: runtimeHooks.publishBoardChangeNotifications,
    },
  );

  return { refs, boardAdapter };
}
