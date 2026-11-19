// The watcher app is a static, client-rendered shell: prerendered at build time and cached by the
// service worker, so every screen opens with no network at all. All data lives in IndexedDB.
export const ssr = false;
export const prerender = true;
