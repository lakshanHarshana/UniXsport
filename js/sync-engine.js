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

      // 2. DOM Ready setup for indicator pill
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.injectSyncPill());
      } else {
        this.injectSyncPill();
      }

      // 3. Periodic Background Health Check & Outbox Flush
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
      if (document.getElementById('unixsport-sync-pill')) return;

      const pill = document.createElement('div');
      pill.id = 'unixsport-sync-pill';
      pill.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 99999;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 6px 14px;
        border-radius: 30px;
        font-family: 'Outfit', sans-serif;
        font-size: 0.82rem;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 4px 14px rgba(0,0,0,0.25);
        transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        user-select: none;
      `;

      pill.addEventListener('click', () => {
        this.heartbeatCheck();
        this.syncOutbox();
      });

      document.body.appendChild(pill);
      this.updatePillUI();
    }

    updatePillUI(forcedState) {
      const pill = document.getElementById('unixsport-sync-pill');
      if (!pill) return;

      const queue = this.getOutbox();
      const state = forcedState || (this.isSyncing ? 'syncing' : (!this.isOnlineState ? 'offline' : (queue.length > 0 ? 'pending' : 'online')));

      if (state === 'syncing') {
        pill.style.background = 'linear-gradient(135deg, #2563eb, #1d4ed8)';
        pill.style.color = '#ffffff';
        pill.innerHTML = '<i class="fas fa-arrows-rotate fa-spin"></i> Syncing with MongoDB...';
      } else if (state === 'offline') {
        pill.style.background = 'linear-gradient(135deg, #dc2626, #b91c1c)';
        pill.style.color = '#ffffff';
        pill.innerHTML = `<i class="fas fa-wifi-slash"></i> Offline (${queue.length} queued)`;
      } else if (state === 'pending') {
        pill.style.background = 'linear-gradient(135deg, #d97706, #b45309)';
        pill.style.color = '#ffffff';
        pill.innerHTML = `<i class="fas fa-cloud-arrow-up"></i> ${queue.length} Pending Upload`;
      } else {
        pill.style.background = 'linear-gradient(135deg, #059669, #047857)';
        pill.style.color = '#ffffff';
        pill.innerHTML = '<i class="fas fa-shield-halved"></i> Hybrid Cloud Synced';
        // Auto fade online badge slightly
        pill.style.opacity = '0.85';
      }
    }
  }

  // Attach global instance
  if (typeof window !== 'undefined') {
    window.UniXsportSync = new SuperHybridSync();
  }
})();
