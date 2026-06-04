/**
 * firebase-app.js
 *
 * Loads the Firebase compat SDK from Google's gstatic CDN on demand and
 * returns the initialized app + firestore + storage handles. The yaml-flow
 * adapters are SDK-agnostic, so the host just hands them whatever Firebase
 * exposes here.
 *
 * No `firebase` npm dependency: scripts are injected the first time
 * getFirebaseServices() is called, and only then. In localstorage transport
 * mode nothing is loaded.
 */

const FIREBASE_CDN_VERSION = '12.14.0';
const FIREBASE_CDN_BASE = `https://www.gstatic.com/firebasejs/${FIREBASE_CDN_VERSION}`;
const FIREBASE_COMPAT_SCRIPTS = [
  'firebase-app-compat.js',
  'firebase-firestore-compat.js',
];

let firebaseSdkPromise = null;

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-firebase-cdn="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === 'true') {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Failed to load Firebase CDN script: ${src}`)), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.crossOrigin = 'anonymous';
    script.dataset.firebaseCdn = src;
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      resolve();
    }, { once: true });
    script.addEventListener('error', () => reject(new Error(`Failed to load Firebase CDN script: ${src}`)), { once: true });
    document.head.appendChild(script);
  });
}

async function loadFirebaseSdk() {
  if (!firebaseSdkPromise) {
    firebaseSdkPromise = (async () => {
      if (typeof document === 'undefined') {
        throw new Error('Firebase compat CDN can only be loaded in a browser environment');
      }
      for (const fileName of FIREBASE_COMPAT_SCRIPTS) {
        await loadScriptOnce(`${FIREBASE_CDN_BASE}/${fileName}`);
      }
      if (!globalThis.firebase || typeof globalThis.firebase.initializeApp !== 'function') {
        throw new Error('Firebase compat SDK did not expose globalThis.firebase after CDN load');
      }
      return globalThis.firebase;
    })();
  }
  return firebaseSdkPromise;
}

export async function ensureFirebaseApp(config = {}) {
  const firebaseConfig = config?.firebaseConfig ?? {};
  if (!firebaseConfig || typeof firebaseConfig !== 'object' || Object.keys(firebaseConfig).length === 0) {
    throw new Error('firestore storage adapter requires storage.firestore.firebaseConfig');
  }

  const firebase = await loadFirebaseSdk();
  const appName = typeof config?.appName === 'string' && config.appName.trim()
    ? config.appName.trim()
    : `demo-boards-frontend-${firebaseConfig.projectId || 'default'}`;

  const existing = firebase.apps.find((app) => app.name === appName);
  return existing || firebase.initializeApp(firebaseConfig, appName);
}

export async function getFirebaseServices(config = {}) {
  const app = await ensureFirebaseApp(config);
  return {
    app,
    firestore: app.firestore(),
  };
}
