/*
 * Cửa sổ nổi trên YouTube: nút trên trình phát, phím tắt Alt+Shift+P, và tự mở khi chuyển sang tab khác
 * (Chrome gọi thao tác "enterpictureinpicture" của Media Session khi tab đang phát bị ẩn).
 * Phần cửa sổ nổi nằm ở src/page/pip.js (dùng chung cho mọi trang).
 */
(() => {
  'use strict';
  const YTX = globalThis.YTX;
  if (!YTX || YTX.floating) return;

  const F = (YTX.floating = {});
  const pip = () => globalThis.__CT_PIP;

  F.isOpen = () => !!(pip() && pip().isOpen());

  F.toggle = async () => {
    if (!pip()) return { ok: false };
    const res = await pip().toggle({ video: YTX.getVideo() });
    if (!res.ok && YTX.ui) YTX.ui.toast(res.error || 'Không mở được cửa sổ nổi');
    YTX.emit('state');
    return res;
  };

  function registerAuto() {
    try {
      navigator.mediaSession.setActionHandler('enterpictureinpicture', YTX.settings.autoPip
        ? () => { if (!F.isOpen() && YTX.isWatchPage()) F.toggle(); }
        : null);
    } catch (_) { /* trình duyệt chưa hỗ trợ tự mở cửa sổ nổi */ }
  }

  F.init = () => {
    registerAuto();
    YTX.on('settings', registerAuto);
    if (pip()) pip().onChange(() => YTX.emit('state'));
  };
})();
