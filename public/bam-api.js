(function () {
  const DEFAULT_PORT = 5173;
  const STORAGE_KEY = 'beamaker.robotIp';
  const ROBOTS_KEY = 'beamaker.robots';
  const SELECTED_KEY = 'beamaker.selectedRobotId';

  function stripScheme(host) {
    return String(host || '').trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');
  }

  function hasExplicitPort(host) {
    return /:\d+$/.test(host);
  }

  function validLanHost(host) {
    if (!host) return false;
    const value = stripScheme(host);
    if (!value || /\s/.test(value)) return false;
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(value)) {
      return value.split('.').every(function (part) {
        const n = Number(part);
        return n >= 0 && n <= 255;
      });
    }
    if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/i.test(value)) return true;
    return /^[A-Za-z0-9][A-Za-z0-9.-]*[A-Za-z0-9]$/.test(value) || /^[A-Za-z0-9.-]+$/.test(value);
  }

  function resolveHost(host) {
    const value = stripScheme(host);
    if (!value) return '';
    const normalized = value.replace(/\/$/, '');
    if (hasExplicitPort(normalized)) return 'http://' + normalized;
    return 'http://' + normalized + ':' + DEFAULT_PORT;
  }

  function selectedHost() {
    try {
      const stored = JSON.parse(localStorage.getItem(ROBOTS_KEY) || '[]');
      if (Array.isArray(stored) && stored.length) {
        const selectedId = localStorage.getItem(SELECTED_KEY) || stored[0].id || '';
        const robot = stored.find(function (entry) {
          return String(entry.id || '') === String(selectedId);
        }) || stored[0];
        if (robot && validLanHost(robot.host)) return resolveHost(robot.host);
      }
    } catch (_) {
      // ignore
    }
    const fallback = localStorage.getItem(STORAGE_KEY) || '';
    if (validLanHost(fallback)) return resolveHost(fallback);
    return '';
  }

  function originBase() {
    const host = selectedHost();
    if (host) return host;
    return window.location.origin || 'http://localhost:' + DEFAULT_PORT;
  }

  window.BamApi = {
    DEFAULT_PORT: DEFAULT_PORT,
    apiBase: function () {
      return originBase();
    },
    apiUrl: function (path) {
      const clean = String(path || '').replace(/^\/+/g, '');
      return new URL(clean, originBase() + '/').toString();
    },
    wsUrl: function (path) {
      const clean = String(path || '').replace(/^\/+/g, '');
      const base = originBase().replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:');
      return new URL(clean, base + '/').toString();
    },
    fetch: function (path, init) {
      return fetch(window.BamApi.apiUrl(path), init);
    }
  };

  const nativeFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    if (typeof input === 'string' && input.startsWith('/')) {
      return nativeFetch(window.BamApi.apiUrl(input), init);
    }
    if (input && typeof input === 'object' && typeof input.url === 'string' && input.url.startsWith('/')) {
      const clone = new Request(window.BamApi.apiUrl(input.url), input);
      return nativeFetch(clone, init);
    }
    return nativeFetch(input, init);
  };

  const NativeWebSocket = window.WebSocket;
  window.WebSocket = function (url, protocols) {
    if (typeof url === 'string' && url.startsWith('/')) {
      return new NativeWebSocket(window.BamApi.wsUrl(url), protocols);
    }
    return new NativeWebSocket(url, protocols);
  };
})();
