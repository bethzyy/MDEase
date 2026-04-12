// db.js - IndexedDB storage module for MDEase
// Attaches API to window.MDEaseDB for content.js to use
window.MDEaseDB = (function () {
  const DB_NAME = 'mdease-drafts';
  const DB_VERSION = 2;
  const DRAFTS_STORE = 'drafts';
  const FILELIST_STORE = 'filelists';
  let dbInstance = null;

  function openDB() {
    return new Promise((resolve, reject) => {
      if (dbInstance) return resolve(dbInstance);
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(DRAFTS_STORE)) {
          db.createObjectStore(DRAFTS_STORE, { keyPath: 'path' });
        }
        if (!db.objectStoreNames.contains(FILELIST_STORE)) {
          db.createObjectStore(FILELIST_STORE, { keyPath: 'dirPath' });
        }
      };
      request.onsuccess = (e) => {
        dbInstance = e.target.result;
        resolve(dbInstance);
      };
      request.onerror = (e) => reject(e.target.error);
    });
  }

  // ===== Draft CRUD =====
  async function saveDraft(path, content) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DRAFTS_STORE, 'readwrite');
      const store = tx.objectStore(DRAFTS_STORE);
      store.put({ path, content, lastModified: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async function loadDraft(path) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DRAFTS_STORE, 'readonly');
      const store = tx.objectStore(DRAFTS_STORE);
      const request = store.get(path);
      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async function deleteDraft(path) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DRAFTS_STORE, 'readwrite');
      const store = tx.objectStore(DRAFTS_STORE);
      store.delete(path);
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async function hasDraft(path) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DRAFTS_STORE, 'readonly');
      const store = tx.objectStore(DRAFTS_STORE);
      const request = store.get(path);
      request.onsuccess = () => resolve(!!request.result);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  // ===== File List Cache =====
  async function saveFileList(dirPath, files) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(FILELIST_STORE, 'readwrite');
      const store = tx.objectStore(FILELIST_STORE);
      store.put({ dirPath, files, lastUpdated: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async function loadFileList(dirPath) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(FILELIST_STORE, 'readonly');
      const store = tx.objectStore(FILELIST_STORE);
      const request = store.get(dirPath);
      request.onsuccess = () => resolve(request.result ? request.result.files : null);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async function loadFileListMeta(dirPath) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(FILELIST_STORE, 'readonly');
      const store = tx.objectStore(FILELIST_STORE);
      const request = store.get(dirPath);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  return { saveDraft, loadDraft, deleteDraft, hasDraft, saveFileList, loadFileList, loadFileListMeta };
})();
