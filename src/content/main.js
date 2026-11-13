/*
 * Khởi động: nạp cài đặt, gắn các module, theo dõi chuyển trang của YouTube
 * và nhận lệnh từ popup.
 */
(() => {
  'use strict';
  const YTX = globalThis.YTX;
  if (!YTX || YTX.started) return;
  YTX.started = true;

  const T = YTX.transform;
  const L = YTX.lights;
  const C = YTX.cinema;
  const Z = YTX.zoom;
  const UI = YTX.ui;
  const I18N = globalThis.YTX_I18N;
  const ZOOM_STEP = 1.15;
  let panHintShown = false;

  // ---- Danh sách thao tác (dùng chung cho nút, phím tắt, popup) ---------------
  YTX.actions = {
    flipH: () => T.flipH(),
    flipV: () => T.flipV(),
    rotateLeft: () => T.rotate(-90),
    rotateRight: () => T.rotate(90),
    rotate180: () => T.rotate(180),
    resetTransform: () => T.reset(true),
    toggleLights: () => L.toggle(),
    lightsOff: () => L.set(true),
    lightsOn: () => L.set(false),
    toggleCinema: () => C.toggle(),
    // Phóng to & cắt viền (zoom.js trả về chuỗi thông báo riêng)
    autoCrop: () => Z.autoCrop(),
    fillFrame: () => Z.fill(),
    crop21x9: () => Z.ratio('crop21x9'),
    crop4x3: () => Z.ratio('crop4x3'),
    zoomIn: () => T.zoomBy(ZOOM_STEP),
    zoomOut: () => T.zoomBy(1 / ZOOM_STEP),
    resetZoom: () => T.resetZoom(),
    // Tải về (bất đồng bộ, tự hiện thông báo)
    snapshot: () => YTX.download.snapshot(),
    // #full-start
    downloadThumb: () => YTX.download.downloadThumb(),
    // #full-end
    togglePip: () => YTX.floating.toggle(),
  };

  // Thao tác chỉ dùng được ở trang xem video
  const WATCH_ONLY = new Set(['toggleLights', 'lightsOff', 'lightsOn', 'toggleCinema', 'downloadThumb']);

  function toastText(action) {
    if (action === 'toggleLights' || action === 'lightsOff' || action === 'lightsOn') {
      return L.dark ? I18N.t('yt_toast_lights_off') : I18N.t('yt_toast_lights_on');
    }
    if (action === 'toggleCinema') {
      return C.on ? I18N.t('yt_toast_cinema_on') : I18N.t('yt_toast_cinema_off');
    }
    const t = T.describe();
    const label = YTX.LABELS[action] || '';
    if (action === 'resetTransform') return I18N.t('yt_toast_transform_reset');
    if (action === 'resetZoom') return I18N.t('yt_toast_zoom_reset');
    if (action === 'zoomIn' || action === 'zoomOut') return `${label} · ${t.zoom}%`;
    return `${label} · ${t.angle}°`;
  }

  /** Lần đầu phóng to: nhắc có thể kéo để di chuyển khung hình. */
  function withPanHint(text) {
    if (panHintShown || !T.isZoomed()) return text;
    panHintShown = true;
    return I18N.t('yt_toast_pan_hint', text);
  }

  YTX.getState = () => ({
    hasPlayer: !!YTX.getVideo(),
    isWatch: YTX.isWatchPage(),
    lightsOff: L.dark,
    cinema: C.on,
    transform: T.describe(),
  });

  /** Chạy một thao tác theo tên, trả về trạng thái mới. */
  YTX.run = (action, { toast = true } = {}) => {
    const fn = YTX.actions[action];
    if (!fn) return YTX.getState();
    if (WATCH_ONLY.has(action)) {
      if (!YTX.isWatchPage() && !L.dark && !C.on) {
        UI.toast(I18N.t('yt_toast_watch_only'));
        return YTX.getState();
      }
    } else if (!YTX.getVideo()) {
      return YTX.getState();
    }
    const msg = fn();
    if (msg && typeof msg.then === 'function') return YTX.getState(); // thao tác bất đồng bộ tự báo
    if (toast) UI.toast(withPanHint(typeof msg === 'string' && msg ? msg : toastText(action)));
    return YTX.getState();
  };

  // ---- Theo dõi chuyển trang (YouTube là ứng dụng một trang) -----------------
  function onNavigate() {
    T.onNavigate();
    L.onNavigate();
    C.onNavigate();
    YTX.download.onNavigate();
    YTX.ambient.sync();
    UI.ensure();
  }

  document.addEventListener('yt-navigate-finish', onNavigate);
  document.addEventListener('yt-player-updated', () => UI.ensure());
  document.addEventListener('fullscreenchange', () => {
    T.update();
    if (!document.fullscreenElement) UI.ensure();
  });
  window.addEventListener('popstate', () => setTimeout(onNavigate, 0));

  // YouTube có thể dựng lại thanh điều khiển / chuyển khung trình phát -> kiểm tra định kỳ (rất nhẹ).
  setInterval(() => {
    UI.ensure();
    YTX.stack.refresh();
    if (!YTX.isWatchPage()) {
      if (L.dark) L.set(false);
      if (C.on) C.set(false);
    }
  }, 1000);

  // ---- Nhận lệnh từ popup -----------------------------------------------------
  if (globalThis.chrome?.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!msg || typeof msg.type !== 'string' || !msg.type.startsWith('ytx:')) return;
      if (msg.type === 'ytx:getState') sendResponse(YTX.getState());
      else if (msg.type === 'ytx:run') sendResponse(YTX.run(msg.action));
    });
  }

  // ---- Khởi động ----------------------------------------------------------------
  (async () => {
    await YTX.loadSettings();
    T.init();
    L.init();
    YTX.ambient.init();
    Z.init();
    YTX.download.init();
    YTX.floating.init();
    UI.init();
    YTX.shortcuts.init();
    onNavigate();
  })();
})();
