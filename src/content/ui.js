/*
 * Giao diện trong trình phát: các nút trên thanh điều khiển (Tải về, Xoay/lật/phóng to,
 * Tắt đèn, Rạp phim), bảng chọn xoay/lật/phóng to và thông báo nhanh (toast).
 * Bảng "Tải về" nằm ở download.js.
 */
(() => {
  'use strict';
  const YTX = globalThis.YTX;
  if (!YTX || YTX.ui) return;

  const UI = (YTX.ui = {});
  const h = YTX.h;
  const I18N = globalThis.YTX_I18N;

  const PANEL_ACTIONS = ['flipH', 'flipV', 'rotateLeft', 'rotateRight', 'rotate180', 'resetTransform'];

  let btnDownload = null;
  let btnPip = null;
  let btnTransform = null;
  let btnLights = null;
  let btnCinema = null;
  let panel = null;
  let panelState = null;
  let zoomValue = null;
  let toastEl = null;
  let toastTimer = 0;

  // Chặn sự kiện để YouTube không hiểu nhầm thành bấm vào video (dừng/phát, toàn màn hình).
  function shield(el) {
    for (const type of ['click', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'wheel']) {
      el.addEventListener(type, (e) => e.stopPropagation());
    }
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') UI.closePanel();
      e.stopPropagation();
    });
  }

  UI.shield = shield;

  function playerButton(id, icon, label, onClick) {
    const btn = h('button', {
      id,
      class: 'ytp-button ytx-btn',
      type: 'button',
      'aria-label': label,
      'data-ytx-tip': label,
    }, [YTX.icon(icon)]);
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
    return btn;
  }

  function buildButtons() {
    // #full-start
    btnDownload = playerButton('ytx-btn-download', 'download', I18N.t('full_yt_btn_download'), () => YTX.download.togglePanel());
    btnDownload.setAttribute('aria-haspopup', 'true');
    btnDownload.setAttribute('aria-expanded', 'false');
    // #full-end
    btnPip = playerButton('ytx-btn-pip', 'pip', I18N.t('yt_btn_pip'), () => YTX.run('togglePip'));
    btnTransform = playerButton('ytx-btn-transform', 'transform', I18N.t('yt_btn_transform'), () => UI.togglePanel());
    btnTransform.setAttribute('aria-haspopup', 'true');
    btnTransform.setAttribute('aria-expanded', 'false');
    btnLights = playerButton('ytx-btn-lights', 'lights', I18N.t('yt_btn_lights_off'), () => YTX.run('toggleLights'));
    btnCinema = playerButton('ytx-btn-cinema', 'cinema', I18N.t('yt_btn_cinema'), () => YTX.run('toggleCinema'));
  }

  function panelButton(action, { icon = action, text = YTX.LABELS[action], cls = '', title } = {}) {
    const children = [];
    if (icon) children.push(YTX.icon(icon));
    if (text) children.push(h('span', { text }));
    return h('button', {
      class: `ytx-panel-btn ${cls}`.trim(),
      type: 'button',
      'data-action': action,
      title: title || YTX.LABELS[action],
      'aria-label': title || YTX.LABELS[action],
    }, children);
  }

  function buildPanel() {
    panelState = h('span', { class: 'ytx-panel-state' });
    zoomValue = panelButton('resetZoom', { icon: null, text: '100%', cls: 'ytx-zoom-val', title: I18N.t('yt_zoom_reset_title') });
    panel = h('div', { class: 'ytx-panel', role: 'dialog', 'aria-label': I18N.t('yt_transform_panel_title') }, [
      h('div', { class: 'ytx-panel-head' }, [h('span', { class: 'ytx-panel-title', text: I18N.t('yt_transform_panel_title') }), panelState]),
      h('div', { class: 'ytx-panel-grid' }, PANEL_ACTIONS.map((action) => panelButton(action))),
      h('div', { class: 'ytx-panel-sub', text: I18N.t('yt_panel_zoom_crop') }),
      h('div', { class: 'ytx-panel-grid' }, [
        panelButton('autoCrop', { text: I18N.t('yt_btn_autocrop'), title: I18N.t('yt_btn_autocrop_title') }),
        panelButton('fillFrame', { text: I18N.t('yt_btn_fill') }),
      ]),
      h('div', { class: 'ytx-zoom-row' }, [
        panelButton('crop21x9', { icon: null, text: '21:9', cls: 'ytx-chip' }),
        panelButton('crop4x3', { icon: null, text: '4:3', cls: 'ytx-chip' }),
        panelButton('zoomOut', { text: null, cls: 'ytx-zoom-step', title: I18N.t('yt_btn_zoom_out_title') }),
        zoomValue,
        panelButton('zoomIn', { text: null, cls: 'ytx-zoom-step', title: I18N.t('yt_btn_zoom_in_title') }),
      ]),
    ]);
    panel.addEventListener('click', (e) => {
      const btn = e.target.closest('.ytx-panel-btn');
      if (!btn) return;
      // Tự cắt viền có thể thất bại (cảnh quá tối…) nên vẫn hiện thông báo.
      const action = btn.dataset.action;
      YTX.run(action, { toast: action === 'autoCrop' });
    });
    shield(panel);
  }

  function removeButtons() {
    btnDownload?.remove();
    btnPip?.remove();
    YTX.download?.closePanel();
    btnTransform?.remove();
    btnLights?.remove();
    btnCinema?.remove();
    UI.closePanel();
  }

  /** Đảm bảo các nút có mặt trên thanh điều khiển (YouTube hay dựng lại thanh này). */
  UI.ensure = () => {
    const player = YTX.getPlayer();
    if (!player || !YTX.settings.playerButtons) {
      removeButtons();
      return;
    }
    // Giao diện mới (2025): .ytp-right-controls-left; giao diện cũ: .ytp-right-controls
    const host = player.querySelector('.ytp-right-controls-left') || player.querySelector('.ytp-right-controls');
    if (!host) return;

    if (!btnTransform) buildButtons();
    const buttons = [btnDownload, btnPip, btnTransform, btnLights, btnCinema].filter(Boolean); // bản Store: không có btnDownload
    if (buttons.some((b) => b.parentElement !== host)) {
      const anchor =
        host.querySelector(':scope > .ytp-subtitles-button') ||
        host.querySelector(':scope > .ytp-settings-button') ||
        host.firstElementChild;
      for (const b of buttons) host.insertBefore(b, anchor);
    }
    if (panel && panel.parentElement !== player) player.append(panel);
    UI.refresh();
  };

  /** Cập nhật trạng thái hiển thị của nút và bảng chọn. */
  UI.refresh = () => {
    const t = YTX.transform.describe();
    const dark = YTX.lights.dark;
    if (btnLights) {
      btnLights.classList.toggle('ytx-active', dark);
      btnLights.classList.toggle('ytx-hidden', !YTX.isWatchPage());
      const label = dark ? I18N.t('yt_btn_lights_on') : I18N.t('yt_btn_lights_off');
      btnLights.setAttribute('aria-label', label);
      btnLights.setAttribute('data-ytx-tip', label);
      btnLights.setAttribute('aria-pressed', String(dark));
    }
    if (btnCinema) {
      const on = YTX.cinema.on;
      btnCinema.classList.toggle('ytx-active', on);
      btnCinema.classList.toggle('ytx-hidden', !YTX.isWatchPage());
      const label = on ? I18N.t('yt_btn_cinema_exit') : I18N.t('yt_btn_cinema');
      btnCinema.setAttribute('aria-label', label);
      btnCinema.setAttribute('data-ytx-tip', label);
      btnCinema.setAttribute('aria-pressed', String(on));
    }
    if (btnTransform) btnTransform.classList.toggle('ytx-active', t.active);
    if (btnDownload) btnDownload.classList.toggle('ytx-hidden', !YTX.isWatchPage());
    if (btnPip) {
      const open = !!(YTX.floating && YTX.floating.isOpen());
      const label = open ? I18N.t('yt_btn_pip_close') : I18N.t('yt_btn_pip');
      btnPip.classList.toggle('ytx-active', open);
      btnPip.setAttribute('aria-label', label);
      btnPip.setAttribute('data-ytx-tip', label);
    }
    if (panel) {
      if (t.flipH && t.flipV) panelState.textContent = I18N.t('yt_panel_state_flip_hv', t.angle);
      else if (t.flipH) panelState.textContent = I18N.t('yt_panel_state_flip_h', t.angle);
      else if (t.flipV) panelState.textContent = I18N.t('yt_panel_state_flip_v', t.angle);
      else panelState.textContent = `${t.angle}°`;
      zoomValue.firstChild.textContent = `${t.zoom}%`;
      const CROP_OF = { autoCrop: 'auto', fillFrame: 'fill', crop21x9: '21:9', crop4x3: '4:3' };
      for (const btn of panel.querySelectorAll('.ytx-panel-btn')) {
        const a = btn.dataset.action;
        const on = (a === 'flipH' && t.flipH) || (a === 'flipV' && t.flipV) ||
          (a in CROP_OF && t.crop === CROP_OF[a]);
        btn.classList.toggle('ytx-active', on);
      }
    }
  };

  // ---- Bảng chọn xoay/lật -----------------------------------------------------
  UI.isPanelOpen = () => !!panel && panel.classList.contains('ytx-open');

  UI.openPanel = () => {
    const player = YTX.getPlayer();
    if (!player) return;
    if (!panel) buildPanel();
    YTX.download?.closePanel();
    if (panel.parentElement !== player) player.append(panel);
    // Đặt bảng ngay trên thanh điều khiển.
    const bar = player.querySelector('.ytp-chrome-bottom');
    const bottom = bar ? player.clientHeight - bar.offsetTop + 8 : 64;
    panel.style.bottom = `${Math.max(48, bottom)}px`;
    UI.refresh();
    panel.classList.add('ytx-open');
    btnTransform?.setAttribute('aria-expanded', 'true');
  };

  UI.closePanel = () => {
    if (!panel) return;
    panel.classList.remove('ytx-open');
    btnTransform?.setAttribute('aria-expanded', 'false');
  };

  UI.togglePanel = () => (UI.isPanelOpen() ? UI.closePanel() : UI.openPanel());

  UI.setDownloadExpanded = (on) => btnDownload?.setAttribute('aria-expanded', String(on));
  UI.isDownloadButton = (target) => !!btnDownload && btnDownload.contains(target);

  // ---- Thông báo nhanh ----------------------------------------------------------
  UI.toast = (text) => {
    const player = YTX.getPlayer();
    if (!player || !text) return;
    if (!toastEl) toastEl = h('div', { class: 'ytx-toast', role: 'status' });
    if (toastEl.parentElement !== player) player.append(toastEl);
    toastEl.textContent = text;
    toastEl.classList.add('ytx-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('ytx-show'), 1300);
  };

  UI.init = () => {
    YTX.on('state', UI.refresh);
    YTX.on('settings', UI.ensure);
    // Bấm ra ngoài thì đóng bảng chọn.
    document.addEventListener('pointerdown', (e) => {
      if (!UI.isPanelOpen()) return;
      if (panel.contains(e.target) || btnTransform?.contains(e.target)) return;
      UI.closePanel();
    }, true);
    UI.ensure();
  };
})();
