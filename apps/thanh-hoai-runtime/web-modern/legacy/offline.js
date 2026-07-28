"use strict";

(function () {
  const DB_NAME = "thanh-hoai-offline-v1";
  const STORE = "journal_drafts";
  const MAX_FILES = 12;
  const MAX_FILE_BYTES = 15 * 1024 * 1024;
  const IMAGE_TYPES = new Set(["image/jpeg", "image/png"]);

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "key" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Khong mo duoc kho nhap offline."));
    });
  }

  function tx(db, mode, work) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const store = transaction.objectStore(STORE);
      let request;
      try { request = work(store); } catch (error) { db.close(); reject(error); return; }
      transaction.oncomplete = () => { const result = request && request.result; db.close(); resolve(result); };
      transaction.onerror = () => { db.close(); reject(transaction.error); };
      transaction.onabort = () => { db.close(); reject(transaction.error || new Error("Giao dich offline bi huy.")); };
    });
  }

  function cleanPhotos(photos) {
    const rows = [];
    Object.entries(photos || {}).forEach(([stage, files]) => {
      Array.from(files || []).forEach((file) => {
        if (rows.length >= MAX_FILES) throw new Error("Ban nhap offline chi luu toi da 12 anh.");
        if (!IMAGE_TYPES.has(file.type) || file.size > MAX_FILE_BYTES) {
          throw new Error("Anh offline chi nhan JPG/PNG va toi da 15 MB/anh.");
        }
        rows.push({ stage, file, name: file.name, type: file.type, size: file.size });
      });
    });
    return rows;
  }

  window.THOfflineDraft = {
    key(username, projectId) {
      return `journal:${String(username || "anonymous")}:${Number(projectId || 0)}`;
    },
    async save(key, fields, materials, photos) {
      const db = await openDb();
      const row = { key, fields: fields || {}, materials: materials || [], photos: cleanPhotos(photos),
        saved_at: new Date().toISOString(), schema_version: 1 };
      await tx(db, "readwrite", (store) => store.put(row));
      return row;
    },
    async load(key) {
      const db = await openDb();
      return tx(db, "readonly", (store) => store.get(key));
    },
    async remove(key) {
      const db = await openDb();
      await tx(db, "readwrite", (store) => store.delete(key));
      return true;
    }
  };
})();
