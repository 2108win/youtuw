/*
 * Tắt đèn + đưa trình phát lên trên các lớp khác.
 *
 * - Màn che: lớp đen cố định phủ toàn trang (z-index 2100, trên thanh tiêu đề
 *   YouTube ở 2020). Trình phát #movie_player được nâng lên 2102.
 * - YTX.stack: nâng trình phát (dùng chung cho Tắt đèn và Rạp phim), kèm xử lý
 *   các lớp cha tạo stacking context riêng (YouTube gắn view-transition-name).
 * - Đèn nền nằm ở ambient.js.
 */
(() => {
  'use strict';
  const YTX = globalThis.YTX;
  if (!YTX || YTX.lights) return;

  const L = (YTX.lights = { dark: false });
  const S = (YTX.stack = {});
  const FADE_MS = 450;

  let overlay = null;
  let liftTimer = 0;
  let liftedEls = [];

  function ensureOverlay() {
    if (overlay && overlay.isConnected) return;
    overlay = YTX.h('div', { id: 'ytx-overlay' });
    overlay.addEventListener('click', () => L.set(false));
    document.body.append(overlay);
  }

  function applySettings() {
    const s = YTX.settings;
    const root = document.documentElement.style;
    root.setProperty('--ytx-dim', String(s.dim));
    root.setProperty('--ytx-glow-opacity', String(s.glow ? s.glowStrength : 0));
    root.setProperty('--ytx-glow-blur', `${Math.round(28 + s.glowSize * 0.4)}px`);
  }

  // ---- Nâng trình phát ----------------------------------------------------------
  function stackingReason(el) {
    if (el.classList.contains('ytx-lift-vt')) return 'vt';
    const c = getComputedStyle(el);
    if (c.viewTransitionName && c.viewTransitionName !== 'none') return 'vt';
    const parentDisplay = el.parentElement ? getComputedStyle(el.parentElement).display : '';
    const zActive = c.zIndex !== 'auto' && (c.position !== 'static' || /flex|grid/.test(parentDisplay));
    if (
      zActive ||
      c.position === 'fixed' || c.position === 'sticky' ||
      c.transform !== 'none' || c.filter !== 'none' || c.perspective !== 'none' ||
      c.clipPath !== 'none' || (c.maskImage && c.maskImage !== 'none') ||
      parseFloat(c.opacity) < 1 || c.isolation === 'isolate' || c.mixBlendMode !== 'normal' ||
      (c.backdropFilter && c.backdropFilter !== 'none') ||
      /transform|opacity|filter|perspective|z-index/.test(c.willChange) ||
      /paint|layout|strict|content/.test(c.contain)
    ) return 'z';
    return null;
  }

  function unliftAncestors() {
    for (const el of liftedEls) el.classList.remove('ytx-lift-vt', 'ytx-lift-z', 'ytx-lift-pos');
    liftedEls = [];
  }

  function liftAncestors() {
    const player = YTX.getPlayer();
    const next = [];
    for (let el = player && player.parentElement; el && el !== document.body; el = el.parentElement) {
      const reason = stackingReason(el);
      if (!reason) continue;
      next.push(el);
      if (reason === 'vt') {
        el.classList.add('ytx-lift-vt');
      } else if (!el.classList.contains('ytx-lift-z')) {
        el.classList.add('ytx-lift-z');
        const parentDisplay = el.parentElement ? getComputedStyle(el.parentElement).display : '';
        if (getComputedStyle(el).position === 'static' && !/flex|grid/.test(parentDisplay)) {
          el.classList.add('ytx-lift-pos');
        }
      }
    }
    for (const el of liftedEls) {
      if (!next.includes(el)) el.classList.remove('ytx-lift-vt', 'ytx-lift-z', 'ytx-lift-pos');
    }
    liftedEls = next;
  }

  const wantLift = () => L.dark || !!(YTX.cinema && YTX.cinema.on);

  /** Bật/tắt việc nâng trình phát theo trạng thái Tắt đèn / Rạp phim. */
  S.sync = () => {
    const root = document.documentElement;
    clearTimeout(liftTimer);
    if (wantLift()) {
      root.classList.add('ytx-lift');
      liftAncestors();
    } else {
      // Chờ màn che mờ hẳn rồi mới hạ trình phát.
      liftTimer = setTimeout(() => {
        if (wantLift()) return;
        root.classList.remove('ytx-lift');
        unliftAncestors();
      }, FADE_MS);
    }
  };

  /** Dò lại lớp cha (YouTube có thể chuyển trình phát sang khung khác). */
  S.refresh = () => {
    if (wantLift()) liftAncestors();
  };

  // ---- Tắt đèn -------------------------------------------------------------------
  L.set = (dark) => {
    dark = !!dark;
    if (dark && !YTX.isWatchPage()) return L.dark;
    if (dark === L.dark) return L.dark;
    L.dark = dark;
    const root = document.documentElement;
    if (dark) {
      ensureOverlay();
      applySettings();
      S.sync();
      void overlay.offsetWidth; // để hiệu ứng mờ dần chạy
      root.classList.add('ytx-lights-off');
    } else {
      root.classList.remove('ytx-lights-off');
      S.sync();
    }
    YTX.ambient.sync();
    YTX.emit('state');
    return L.dark;
  };

  L.toggle = () => L.set(!L.dark);

  L.onNavigate = () => {
    if (!YTX.isWatchPage()) L.set(false);
  };

  L.init = () => {
    applySettings();
    YTX.on('settings', applySettings);
  };
})();
