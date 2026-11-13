/*
 * Chèn vào trang khi chụp màn hình (service worker điều khiển, chụp bằng chrome.tabs.captureVisibleTab):
 *  - prepare():  ẩn thanh cuộn, đo kích thước trang, nhớ vị trí cuộn.
 *  - scrollTo(y): cuộn tức thì tới y, chờ trang vẽ xong, trả về vị trí thật.
 *  - hideFixed(): sau khung đầu, ẩn phần tử fixed/sticky (thanh tiêu đề dính) để không lặp lại ở mọi khung.
 *  - restore():  trả trang về như cũ.
 *  - select():   lớp phủ để kéo chọn vùng; trả về hình chữ nhật (toạ độ màn hình) hoặc null nếu huỷ.
 * Tạo phần tử bằng DOM API (không innerHTML) vì có trang bật Trusted Types.
 */
(() => {
  'use strict';
  const VERSION = 2;
  if (globalThis.__CT_SHOT && globalThis.__CT_SHOT.version >= VERSION) return;
  const { t } = globalThis.YTX_I18N; // service worker chèn src/shared/i18n.js cùng lúc, ngay trước file này

  const MAX_ELEMENTS = 30000;
  let saved = null; // trạng thái trước khi chụp

  // Chờ trang vẽ xong 2 khung hình; tối đa 150 ms (trang bị ẩn / cửa sổ thu nhỏ thì không có khung hình nào).
  const frame = () => new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    requestAnimationFrame(() => requestAnimationFrame(finish));
    setTimeout(finish, 150);
  });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function scroller() {
    return document.scrollingElement || document.documentElement;
  }

  async function prepare(opts = {}) {
    if (!saved) {
      const style = document.createElement('style');
      style.id = 'ct-shot-style';
      // Chụp cả trang: ẩn thanh cuộn (không thì mọi khung đều có dải thanh cuộn).
      // Luôn tắt cuộn mượt và "cuộn hít" (scroll-snap) để cuộn tới đúng vị trí.
      const base = 'html,body{scroll-behavior:auto!important;scroll-snap-type:none!important}';
      style.textContent = opts.hideScrollbar
        ? `${base}html,body{scrollbar-width:none!important}::-webkit-scrollbar{width:0!important;height:0!important}`
        : base;
      (document.head || document.documentElement).append(style);
      saved = { x: scrollX, y: scrollY, style, hidden: [] };
    }
    await frame();
    const se = scroller();
    const body = document.body || se;
    return {
      width: document.documentElement.clientWidth || innerWidth,
      height: Math.max(se.scrollHeight, body.scrollHeight, document.documentElement.clientHeight),
      viewWidth: document.documentElement.clientWidth || innerWidth,
      viewHeight: document.documentElement.clientHeight || innerHeight,
      // Ảnh captureVisibleTab gồm cả thanh cuộn (nếu còn hiện) -> tính tỉ lệ theo bề rộng này.
      captureWidth: innerWidth,
      captureHeight: innerHeight,
      dpr: devicePixelRatio || 1,
      scrollY,
      title: (document.title || location.hostname).trim(),
      url: location.href,
    };
  }

  async function scrollTo(y) {
    window.scrollTo({ left: scrollX, top: y, behavior: 'instant' });
    await frame();
    await sleep(120); // chờ ảnh lười tải / hiệu ứng nhỏ
    await frame();
    return scrollY;
  }

  /**
   * Sau khung đầu: phần tử "fixed" (thanh tiêu đề, nút chat) bị ẩn để không lặp ở mọi khung;
   * phần tử "sticky" chuyển thành "static" (cùng vị trí trong trang) để vẫn hiện đúng một lần ở chỗ của nó.
   */
  function hideFixed() {
    if (!saved) return 0;
    const all = document.querySelectorAll('body *');
    let count = 0;
    for (let i = 0; i < all.length && i < MAX_ELEMENTS; i += 1) {
      const el = all[i];
      const pos = getComputedStyle(el).position;
      let prop;
      let value;
      if (pos === 'fixed') [prop, value] = ['visibility', 'hidden'];
      else if (pos === 'sticky') [prop, value] = ['position', 'static'];
      else continue;
      saved.hidden.push([el, prop, el.style.getPropertyValue(prop), el.style.getPropertyPriority(prop)]);
      el.style.setProperty(prop, value, 'important');
      count += 1;
    }
    return count;
  }

  async function restore() {
    if (!saved) return;
    for (const [el, prop, value, prio] of saved.hidden) {
      if (value) el.style.setProperty(prop, value, prio);
      else el.style.removeProperty(prop);
    }
    saved.style.remove();
    window.scrollTo({ left: saved.x, top: saved.y, behavior: 'instant' });
    saved = null;
  }

  /** Lớp phủ chọn vùng: kéo chuột để chọn, Esc để huỷ. Trả về { x, y, width, height } theo toạ độ màn hình. */
  function select() {
    return new Promise((resolve) => {
      const host = document.createElement('div');
      host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;';
      const root = host.attachShadow({ mode: 'closed' });
      const style = document.createElement('style');
      style.textContent = `
        .layer { position: fixed; inset: 0; cursor: crosshair; background: rgba(0,0,0,.35); }
        .layer.dragging { background: transparent; }
        .box { position: fixed; display: none; border: 2px solid #ffcf4a; box-shadow: 0 0 0 100vmax rgba(0,0,0,.45);
          pointer-events: none; }
        .size { position: absolute; right: -2px; bottom: calc(100% + 4px); padding: 2px 6px; border-radius: 5px;
          background: #ffcf4a; color: #241c05; font: 600 12px/1.4 "Segoe UI", system-ui, sans-serif; white-space: nowrap; }
        .hint { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); padding: 7px 14px; border-radius: 999px;
          background: rgba(20,20,20,.9); color: #fff; font: 500 13px/1.3 "Segoe UI", system-ui, sans-serif; pointer-events: none; }
      `;
      const layer = document.createElement('div');
      layer.className = 'layer';
      const box = document.createElement('div');
      box.className = 'box';
      const size = document.createElement('span');
      size.className = 'size';
      box.append(size);
      const hint = document.createElement('div');
      hint.className = 'hint';
      hint.textContent = t('page_shot_select_hint');
      root.append(style, layer, box, hint);
      document.documentElement.append(host);

      let start = null;
      let rect = null;
      const finish = async (value) => {
        removeEventListener('keydown', onKey, true);
        host.remove();
        await frame(); // để lớp phủ không lọt vào ảnh chụp
        resolve(value);
      };
      const onKey = (e) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        finish(null);
      };
      addEventListener('keydown', onKey, true);

      layer.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        layer.setPointerCapture(e.pointerId);
        start = { x: e.clientX, y: e.clientY };
        layer.classList.add('dragging');
        hint.style.display = 'none';
      });
      layer.addEventListener('pointermove', (e) => {
        if (!start) return;
        const x = Math.min(start.x, e.clientX);
        const y = Math.min(start.y, e.clientY);
        rect = { x, y, width: Math.abs(e.clientX - start.x), height: Math.abs(e.clientY - start.y) };
        Object.assign(box.style, { display: 'block', left: `${x}px`, top: `${y}px`, width: `${rect.width}px`, height: `${rect.height}px` });
        size.textContent = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;
      });
      layer.addEventListener('pointerup', () => {
        if (!start) return;
        start = null;
        if (!rect || rect.width < 8 || rect.height < 8) {
          // Bấm mà không kéo: chọn lại.
          layer.classList.remove('dragging');
          box.style.display = 'none';
          hint.style.display = '';
          rect = null;
          return;
        }
        finish(rect);
      });
    });
  }

  globalThis.__CT_SHOT = { version: VERSION, prepare, scrollTo, hideFixed, restore, select };
})();
