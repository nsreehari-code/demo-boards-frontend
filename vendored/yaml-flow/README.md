# vendored/yaml-flow/browser

These files are a verbatim copy of `yaml-flow/browser/` after `npm run build:browser`. They are vendored here so this UI repo can be built and served standalone, without reaching outside its own tree.

Do not edit by hand. To refresh:

```
cd ../../../yaml-flow
npm run build:browser
cp -R browser ../demo-boards-frontend/vendored/yaml-flow/browser
```

Planned follow-up: replace these files with CDN script tags for the public browser targets (`server-runtime-controlface.js`, `adapters/firestore-storage.js`, `adapters/firebase-storage.js`, `adapters/localstorage-storage.js`).
