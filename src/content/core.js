/*
 * Lõi của content script: namespace YTX, cài đặt, bus sự kiện và tiện ích DOM.
 * Các module khác (transform, lights, ui, shortcuts) gắn vào YTX.
 */
(() => {
  'use strict';
  if (globalThis.YTX) return; // tránh chạy hai lần

  const SHARED = globalThis.YTX_SHARED;
  const YTX = (globalThis.YTX = {});

  YTX.LABELS = SHARED.LABELS;
  YTX.SHORTCUTS = SHARED.SHORTCUTS;
  YTX.settings = { ...SHARED.DEFAULTS };

  // ---- Bus sự kiện nội bộ -------------------------------------------------
  const handlers = new Map();
  YTX.on = (name, fn) => {
    if (!handlers.has(name)) handlers.set(name, new Set());
    handlers.get(name).add(fn);
  };
  YTX.emit = (name, data) => {
    const set = handlers.get(name);
    if (!set) return;
    for (const fn of set) {
      try { fn(data); } catch (err) { console.error('[Cinema Tools]', err); }
    }
  };

  // ---- Cài đặt (chrome.storage.local) -------------------------------------
  // Khi chạy ngoài extension (thử nghiệm), chrome.storage không có -> dùng mặc định.
  const storage = globalThis.chrome?.storage?.local;

  YTX.loadSettings = async () => {
    if (!storage) return YTX.settings;
    try {
      const { settings } = await storage.get('settings');
      YTX.settings = { ...SHARED.DEFAULTS, ...(settings || {}) };
    } catch (err) {
      console.warn('[Cinema Tools] Could not read settings', err);
    }
    return YTX.settings;
  };

  YTX.setSettings = (next) => {
    YTX.settings = { ...SHARED.DEFAULTS, ...next };
    YTX.emit('settings', YTX.settings);
  };

  if (storage && globalThis.chrome?.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.settings) YTX.setSettings(changes.settings.newValue || {});
    });
  }

  // ---- Trình phát YouTube --------------------------------------------------
  YTX.isWatchPage = () => location.pathname === '/watch';
  YTX.getVideoId = () => new URLSearchParams(location.search).get('v');

  YTX.getPlayer = () =>
    document.querySelector('ytd-watch-flexy #movie_player') || document.querySelector('#movie_player');

  YTX.getVideo = (player = YTX.getPlayer()) =>
    (player ? player.querySelector('video.html5-main-video') || player.querySelector('video') : null) ||
    (globalThis.__CT_PIP ? globalThis.__CT_PIP.video() : null); // video đang ở cửa sổ nổi

  YTX.isEditable = (el) => {
    if (!el || el === document.body) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  };

  // ---- Tiện ích DOM --------------------------------------------------------
  /** Tạo phần tử HTML: h('div', { class: 'a', text: 'Xin chào', onclick: fn }, [children]) */
  YTX.h = (tag, props = {}, children = []) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
    for (const child of [].concat(children)) if (child) el.append(child);
    return el;
  };

  YTX.icon = (name) => SHARED.createIcon(name);
})();
