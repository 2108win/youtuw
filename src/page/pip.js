/*
 * Cửa sổ nổi: dùng cửa sổ Picture-in-Picture mặc định của trình duyệt cho video đang phát.
 * Cửa sổ luôn nằm trên mọi ứng dụng, có sẵn nút phát/dừng, quay lại tab, đóng; trên YouTube có thêm
 * video trước/sau (YouTube tự khai báo với trình duyệt).
 *
 * Dùng trên YouTube (content script) và mọi trang khác (popup / phím tắt chèn file này vào).
 * Trình duyệt chỉ cho mở ngay sau khi người dùng bấm nút / phím.
 */
(() => {
  'use strict';
  const VERSION = 2;
  if (globalThis.__CT_PIP && globalThis.__CT_PIP.version >= VERSION) return;

  const isYouTube = /(^|\.)youtube\.com$/.test(location.hostname);
  const listeners = globalThis.__CT_PIP ? globalThis.__CT_PIP.listeners : new Set();
  const notify = () => { for (const fn of listeners) { try { fn(isOpen()); } catch (_) { /* bỏ qua */ } } };

  function visibleArea(v) {
    const r = v.getBoundingClientRect();
    return Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0)) *
      Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
  }

  function allVideos(root = document) {
    const out = [...root.querySelectorAll('video')];
    for (const el of root.querySelectorAll('*')) if (el.shadowRoot) out.push(...allVideos(el.shadowRoot));
    return out;
  }

  /** Video đang phát / hiện rõ nhất trên trang. */
  function pickVideo() {
    if (isYouTube) {
      const v = document.querySelector('#movie_player video.html5-main-video');
      if (v && v.readyState > 0) return v;
    }
    const vids = allVideos().filter((v) => v.readyState > 0 && v.videoWidth > 0);
    vids.sort((a, b) => ((!b.paused) - (!a.paused)) || (visibleArea(b) - visibleArea(a)));
    return vids[0] || null;
  }

  function isOpen() {
    return !!document.pictureInPictureElement;
  }

  async function open(opts = {}) {
    if (isOpen()) return { ok: true, open: true, already: true };
    const video = opts.video && opts.video.isConnected && opts.video.readyState > 0 ? opts.video : pickVideo();
    if (!video) return { ok: false, reason: 'no-video', error: 'Không thấy video nào trên trang này.' };
    // Một số trang cấm cửa sổ nổi cho video của họ; người dùng tự bấm thì vẫn cho mở.
    if (video.disablePictureInPicture) video.disablePictureInPicture = false;
    try {
      await video.requestPictureInPicture();
    } catch (err) {
      const gesture = err && err.name === 'NotAllowedError';
      return {
        ok: false,
        reason: gesture ? 'gesture' : 'error',
        error: gesture ? 'Trình duyệt chặn mở cửa sổ nổi. Hãy bấm lại nút Cửa sổ nổi.'
          : `Không mở được cửa sổ nổi${err && err.message ? `: ${err.message}` : ''}`,
      };
    }
    video.addEventListener('leavepictureinpicture', notify, { once: true });
    notify();
    return { ok: true, open: true };
  }

  async function close() {
    if (isOpen()) await document.exitPictureInPicture().catch(() => {});
    return { ok: true, open: false };
  }

  async function toggle(opts = {}) {
    return isOpen() ? close() : open(opts);
  }

  globalThis.__CT_PIP = {
    version: VERSION,
    listeners,
    open, close, toggle, isOpen,
    hasVideo: () => !!pickVideo(),
    video: () => null, // video vẫn ở trong trang (cửa sổ nổi của trình duyệt chỉ hiển thị nó)
    onChange: (fn) => listeners.add(fn),
  };
})();
