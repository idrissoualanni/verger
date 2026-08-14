const CACHE_NAME = "le-verger-v1";
const API_CACHE = "le-verger-api-v1";
const DB_NAME = "le-verger-offline";
const STORE_NAME = "pending_requests";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.filter((n) => n !== CACHE_NAME && n !== API_CACHE).map((n) => caches.delete(n))
      )
    )
  );
  self.clients.claim();
});

async function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function addToQueue(entry) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(entry);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function syncQueue() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = async () => {
      const items = req.result.sort((a, b) => a.timestamp - b.timestamp);
      for (const item of items) {
        try {
          const res = await fetch(item.url, {
            method: item.method,
            headers: { "Content-Type": "application/json" },
            body: item.body ? JSON.stringify(item.body) : undefined,
          });
          if (res.ok) {
            store.delete(item.id);
          }
        } catch {
          break;
        }
      }
      resolve(true);
    };
    req.onerror = () => reject(req.error);
  });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (!url.pathname.startsWith("/api/")) return;

  if (["POST", "PATCH", "DELETE"].includes(request.method)) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const clone = request.clone();
    clone.json().then((body) => {
      addToQueue({
        id,
        method: request.method,
        url: request.url,
        body,
        timestamp: Date.now(),
      }).catch(console.error);
    }).catch(() => {});
    event.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ queued: true, id }), {
          headers: { "Content-Type": "application/json" },
          status: 202,
        })
      )
    );
    return;
  }

  if (request.method === "GET") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(API_CACHE).then((cache) => cache.put(request, clone));
          return res;
        })
        .catch(() => caches.match(request))
    );
  }
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SYNC") {
    syncQueue()
      .then(() => event.source.postMessage({ type: "SYNC_DONE" }))
      .catch((err) => event.source.postMessage({ type: "SYNC_ERROR", error: err.message }));
  }
});
