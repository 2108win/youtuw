/*
 * Chèn vào tab (mọi khung) để chỉnh âm lượng 0–100% cho các thẻ <video>/<audio>.
 * Âm lượng thực = âm lượng trang tự đặt × hệ số của extension. Khi trang đổi âm lượng (người dùng kéo
 * thanh âm lượng của trang) thì ghi nhận làm mức gốc mới rồi nhân lại hệ số.
 * Mức > 100% do service worker xử lý bằng tabCapture (không qua file này).
 */
(() => {
  'use strict';
  if (globalThis.__CT_VOL) return;

  let factor = 1;
  const base = new WeakMap();    // thẻ media -> âm lượng trang muốn
  const written = new WeakMap(); // thẻ media -> âm lượng extension vừa ghi
  const known = new Set();

  function media(root = document) {
    const out = [...root.querySelectorAll('video, audio')];
    for (const el of root.querySelectorAll('*')) if (el.shadowRoot) out.push(...media(el.shadowRoot));
    return out;
  }

  function apply(el) {
    if (!base.has(el)) base.set(el, el.volume);
    known.add(el);
    const v = Math.max(0, Math.min(1, base.get(el) * factor));
    if (Math.abs(el.volume - v) > 0.0005) {
      written.set(el, v);
      el.volume = v;
    }
  }

  // Trang tự đổi âm lượng -> cập nhật mức gốc (bỏ qua lần đổi do chính extension ghi).
  document.addEventListener('volumechange', (e) => {
    const el = e.target;
    if (!(el instanceof HTMLMediaElement) || !known.has(el)) return;
    const w = written.get(el);
    if (w !== undefined && Math.abs(el.volume - w) < 0.0005) return;
    base.set(el, el.volume);
    if (factor !== 1) apply(el);
  }, true);

  // Thẻ media mới xuất hiện / bắt đầu phát.
  document.addEventListener('play', (e) => {
    if (e.target instanceof HTMLMediaElement && factor !== 1) apply(e.target);
  }, true);
  // Trang đổi DOM liên tục (YouTube, bảng tin): gộp lại, tối đa 1 lần quét mỗi 0,5 giây.
  // Thẻ mới bắt đầu phát đã được sự kiện "play" ở trên xử lý ngay.
  let scanTimer = 0;
  new MutationObserver(() => {
    if (factor === 1 || scanTimer) return;
    scanTimer = setTimeout(() => {
      scanTimer = 0;
      if (factor !== 1) for (const el of media()) if (!known.has(el)) apply(el);
    }, 500);
  }).observe(document.documentElement, { childList: true, subtree: true });

  globalThis.__CT_VOL = {
    set(f) {
      factor = Math.max(0, Math.min(1, Number(f)));
      if (!Number.isFinite(factor)) factor = 1;
      for (const el of media()) apply(el); // hệ số 1 = trả lại đúng âm lượng trang muốn
      return media().length;
    },
    get: () => factor,
  };
})();
