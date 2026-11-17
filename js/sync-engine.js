/**
 * UniXsport - Super Hybrid Client Sync Engine & Transactional Outbox
 * Provides zero-conflict offline support, optimistic updates, and cloud sync.
 */

(function() {
  const OUTBOX_KEY = 'unixsport_outbox_queue';
  const LAST_SYNC_KEY = 'unixsport_last_sync_timestamp';

  class SuperHybridSync {
    constructor() {
      this.isOnlineState = typeof navigator !== 'undefined' ? navigator.onLine : true;
      this.isSyncing = false;
      this.syncListeners = [];
      this.init();
    }

    init() {
      if (typeof window === 'undefined') return;

      // 1. Listen for browser network events
      window.addEventListener('online', () => {
        this.isOnlineState = true;
        this.updatePillUI();
        this.syncOutbox();
      });

      window.addEventListener('offline', () => {
        this.isOnlineState = false;
        this.updatePillUI();
      });

      // 2. Periodic Background Health Check & Outbox Flush
      setInterval(() => {
        this.heartbeatCheck();
      }, 15000);

      // Initial check
      setTimeout(() => {
        this.heartbeatCheck();
        this.syncOutbox();
      }, 1200);
    }

    getOutbox() {
      try {
        const raw = localStorage.getItem(OUTBOX_KEY);
        return raw ? JSON.parse(raw) : [];
      } catch (e) {
        return [];
      }
    }

    saveOutbox(queue) {
      try {
        localStorage.setItem(OUTBOX_KEY, JSON.stringify(queue || []));
        this.updatePillUI();
      } catch (e) {}
    }

    enqueueMutation(action, entityId, patch) {
      const queue = this.getOutbox();
      const mutation = {
        mutationId: 'mut_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8),
        action,
        entityId: entityId || '',
        patch: patch || {},
        clientTimestamp: new Date().toISOString()
      };

      queue.push(mutation);
      this.saveOutbox(queue);
      console.log('[Super Hybrid] Enqueued offline mutation:', action, mutation.mutationId);

      // Attempt immediate sync if online
      if (this.isOnlineState) {
        this.syncOutbox();
      }
      return mutation;
    }

    async heartbeatCheck() {
      if (typeof window === 'undefined') return;
      const apiHost = (typeof window.UniXsportAPI !== 'undefined' && typeof window.UniXsportAPI.getBaseUrl === 'function')
        ? window.UniXsportAPI.getBaseUrl()
        : ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? 'http://localhost:5000' : 'https://unixsport-api.onrender.com');

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(`${apiHost}/api/sync/status`, { credentials: 'omit', signal: controller.signal });
        clearTimeout(timeoutId);

        if (res.ok) {
          const wasOffline = !this.isOnlineState;
          this.isOnlineState = true;
          this.updatePillUI();
          if (wasOffline || this.getOutbox().length > 0) {
            this.syncOutbox();
          }
          return true;
        }
      } catch (e) {
        this.isOnlineState = false;
        this.updatePillUI();
        return false;
      }
      return false;
    }

    async syncOutbox() {
      if (this.isSyncing) return;
      const queue = this.getOutbox();
      if (queue.length === 0) {
        this.updatePillUI();
        return;
      }

      this.isSyncing = true;
      this.updatePillUI('syncing');

      try {
        const apiHost = (typeof window.UniXsportAPI !== 'undefined' && typeof window.UniXsportAPI.getBaseUrl === 'function')
          ? window.UniXsportAPI.getBaseUrl()
          : ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? 'http://localhost:5000' : 'https://unixsport-api.onrender.com');

        const token = (typeof window.UniXsportAPI !== 'undefined' && typeof window.UniXsportAPI.getToken === 'function' ? window.UniXsportAPI.getToken() : '') ||
          sessionStorage.getItem('unixsport_token_student') ||
          sessionStorage.getItem('unixsport_token_coach') ||
          sessionStorage.getItem('unixsport_token_storekeeper') ||
          sessionStorage.getItem('unixsport_token_admin') ||
          sessionStorage.getItem('unixsport_jwt_token') ||
          sessionStorage.getItem('token') ||
          localStorage.getItem('unixsport_jwt_token') ||
          localStorage.getItem('token') || '';

        const res = await fetch(`${apiHost}/api/sync/push`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({ mutations: queue })
        });

        if (res.ok) {
          const data = await res.json();
          if (data && data.success) {
            const processedSet = new Set(data.processedIds || []);
            const remaining = queue.filter(m => !processedSet.has(m.mutationId));
            this.saveOutbox(remaining);
            console.log(`[Super Hybrid] Replayed ${processedSet.size} mutations to Cloud MongoDB Atlas.`);

            // Trigger Delta Pull
            await this.pullDeltas(apiHost);
          }
        }
      } catch (err) {
        console.warn('[Super Hybrid] Outbox sync deferred until network reconnects:', err.message);
      } finally {
        this.isSyncing = false;
        this.updatePillUI();
      }
    }

    async pullDeltas(apiHost) {
      try {
        const since = localStorage.getItem(LAST_SYNC_KEY) || '1970-01-01T00:00:00.000Z';
        const res = await fetch(`${apiHost}/api/sync/pull?since=${encodeURIComponent(since)}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.success) {
            localStorage.setItem(LAST_SYNC_KEY, data.timestamp);
            if (data.deltas && typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('unixsport:delta_sync', { detail: data.deltas }));
            }
          }
        }
      } catch (e) {}
    }

    injectSyncPill() {
      const existing = document.getElementById('unixsport-sync-pill');
      if (existing) existing.remove();
    }

    updatePillUI() {
      const existing = document.getElementById('unixsport-sync-pill');
      if (existing) existing.remove();
    }
  }

  // Attach global instance
  if (typeof window !== 'undefined') {
    window.UniXsportSync = new SuperHybridSync();
  }
})();
