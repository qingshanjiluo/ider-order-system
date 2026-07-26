// store.js — 简易状态管理

class Store {
  constructor() {
    this._state = {
      user: null,
      isLoggedIn: false,
      config: {},
    };
    this._listeners = new Map();
  }

  get(key) {
    return this._state[key];
  }

  set(key, value) {
    const old = this._state[key];
    this._state[key] = value;
    if (old !== value) {
      this._emit(key, value, old);
    }
  }

  setUser(user) {
    this.set('user', user);
    this.set('isLoggedIn', !!user);
  }

  getUser() {
    return this._state.user;
  }

  isLoggedIn() {
    return this._state.isLoggedIn;
  }

  isAdmin() {
    return this._state.user?.is_admin === 1;
  }

  on(key, callback) {
    if (!this._listeners.has(key)) {
      this._listeners.set(key, new Set());
    }
    this._listeners.get(key).add(callback);
    return () => this._listeners.get(key)?.delete(callback);
  }

  _emit(key, value, old) {
    const listeners = this._listeners.get(key);
    if (listeners) {
      listeners.forEach(cb => cb(value, old));
    }
  }

  // ── Auth helpers ──────────────────────
  loadFromStorage() {
    try {
      const token = lsGet('ider_token');
      const userStr = lsGet('ider_user');
      if (token && userStr) {
        const user = JSON.parse(userStr);
        this.setUser(user);
        return true;
      }
    } catch { /* ignore */ }
    return false;
  }

  saveUserToStorage(user, token) {
    try {
      localStorage.setItem('ider_token', token);
      localStorage.setItem('ider_user', JSON.stringify(user));
    } catch { /* 静默降级 */ }
    this.setUser(user);
  }

  clearStorage() {
    try {
      localStorage.removeItem('ider_token');
      localStorage.removeItem('ider_user');
    } catch { /* 静默降级 */ }
    this.setUser(null);
  }
}

// localStorage 安全封装，读写失败时静默降级
function lsGet(key, fallback = null) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}

export const store = new Store();
