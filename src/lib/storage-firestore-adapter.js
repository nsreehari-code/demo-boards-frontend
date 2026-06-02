/**
 * storage-firestore-adapter.js
 *
 * Host-app composition: initialize Firebase, then hand the Firestore + Storage
 * handles to yaml-flow's storage adapters.
 *
 * `config` shape (firestore variant):
 *   {
 *     firebaseConfig: { apiKey, projectId, storageBucket, ... },
 *     appName?: string,
 *   }
 */

import { resolveBoardRefs } from './board-refs.js';
import { getFirebaseServices } from './firebase-app.js';

export async function createStorageAdapter(boardId, config = {}, runtimeHooks = {}) {
  const firestoreApi = globalThis.FirestoreStorage;
  const firebaseStorageApi = globalThis.FirebaseStorage;
  if (!firestoreApi?.createFirestoreBoardRuntimeBundle) {
    throw new Error('yaml-flow firestore-storage browser bundle is not loaded');
  }
  if (!firebaseStorageApi?.wrapWithFirebaseStorageBlobs) {
    throw new Error('yaml-flow firebase-storage browser bundle is not loaded');
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

  return {
    refs,
    boardAdapter: firebaseStorageApi.wrapWithFirebaseStorageBlobs(
      boardAdapter,
      firebaseServices.storage,
      boardId,
    ),
  };
}
