/*
 * Chụp khung hình video đang phát (Alt+Shift+S).
 */
// #full-start
// Bản đầy đủ thêm bảng "Tải về" ngay trên trình phát YouTube (video tốt nhất / 1080p / 720p, âm thanh MP3,
// ảnh bìa, chụp khung hình) và dòng tiến độ của video đang xem.
// Việc tải video do service worker + bộ tải yt-dlp trên máy làm; lựa chọn chi tiết ở popup.
// #full-end
(() => {
  'use strict';
  const YTX = globalThis.YTX;
  if (!YTX || YTX.download) return;

  const D = (YTX.download = {});
  const I18N = globalThis.YTX_I18N;
  const toast = (text) => YTX.ui && YTX.ui.toast(text);

  D.snapshot = async () => {
    const agent = globalThis.__CT_AGENT;
    const video = YTX.getVideo();
    if (!agent || !video) return;
    const res = await agent.snapshot('png', 0.95, video.videoWidth ? video : null);
    toast(res.ok ? I18N.t('yt_toast_snapshot_saved', res.width, res.height) : res.error);
  };

  /* #store-start
  // Bản Store: không có bảng Tải về trên trình phát.
  D.isOpen = () => false;
  D.openPanel = () => {};
  D.closePanel = () => {};
  D.togglePanel = () => {};
  D.contains = () => false;
  D.onNavigate = () => {};
  D.init = () => {};
  #store-end */

  // #full-start
  const { describeJob, describeChoice } = globalThis.YTX_SHARED;
  const h = YTX.h;
  const HOST_CACHE_MS = 60 * 1000;

  // text: chữ trên nút (ngắn); label: mô tả đầy đủ khi rê chuột / thông báo.
  const PRESETS = [
    { icon: 'video', text: I18N.t('full_yt_dl_preset_best'), label: I18N.t('full_yt_dl_preset_best_label'), choice: { mode: 'video', quality: 'best', container: 'mp4' } },
    { icon: 'video', text: '1080p', label: I18N.t('full_yt_dl_preset_video_label', '1080p'), choice: { mode: 'video', quality: 1080, container: 'mp4' } },
    { icon: 'video', text: '720p', label: I18N.t('full_yt_dl_preset_video_label', '720p'), choice: { mode: 'video', quality: 720, container: 'mp4' } },
    { icon: 'music', text: 'MP3', label: I18N.t('full_yt_dl_preset_mp3_label'), choice: { mode: 'audio', audioFormat: 'mp3' } },
  ];

  let panel = null;
  let hostNote = null;
  let statusBox = null;
  let statusTitle = null;
  let statusText = null;
  let statusFill = null;
  let statusActions = null;
  let lastJob = null;
  let host = { ok: null, at: 0, error: '' };

  /** Gửi lệnh cho service worker; extension vừa được tải lại thì trang cũ mất kết nối. */
  async function send(msg) {
    try {
      return await chrome.runtime.sendMessage(msg);
    } catch (err) {
      const text = String((err && err.message) || err);
      return { ok: false, error: /invalidated/i.test(text) ? I18N.t('full_yt_err_extension_updated') : text };
    }
  }

  const videoUrl = () => {
    const id = YTX.getVideoId();
    return id ? `https://www.youtube.com/watch?v=${id}` : null;
  };

  function videoTitle() {
    const el = document.querySelector('ytd-watch-metadata h1, h1.ytd-watch-metadata, #title h1');
    const text = el && el.textContent.trim();
    return text || (globalThis.__CT_AGENT ? globalThis.__CT_AGENT.pageTitle() : document.title);
  }

  function panelButton(icon, text, onClick, title = text) {
    const btn = h('button', { class: 'ytx-panel-btn', type: 'button', title }, [YTX.icon(icon), h('span', { text })]);
    btn.addEventListener('click', onClick);
    return btn;
  }

  function smallButton(icon, label, onClick) {
    const btn = h('button', { class: 'ytx-dl-mini', type: 'button', title: label, 'aria-label': label }, [YTX.icon(icon)]);
    btn.addEventListener('click', onClick);
    return btn;
  }

  function build() {
    hostNote = h('div', { class: 'ytx-dl-note', hidden: true });
    statusTitle = h('div', { class: 'ytx-dl-title' });
    statusText = h('span', { class: 'ytx-dl-text' });
    statusActions = h('span', { class: 'ytx-dl-actions' });
    statusFill = h('i');
    statusBox = h('div', { class: 'ytx-dl-status', hidden: true }, [
      statusTitle,
      h('div', { class: 'ytx-dl-row' }, [statusText, statusActions]),
      h('div', { class: 'ytx-dl-bar' }, [statusFill]),
    ]);
    panel = h('div', { class: 'ytx-panel ytx-dl-panel', role: 'dialog', 'aria-label': I18N.t('full_yt_dl_panel_title') }, [
      h('div', { class: 'ytx-panel-head' }, [
        h('span', { class: 'ytx-panel-title', text: I18N.t('full_yt_dl_panel_title') }),
        h('span', { class: 'ytx-panel-state', text: I18N.t('full_yt_dl_panel_state') }),
      ]),
      h('div', { class: 'ytx-panel-grid ytx-dl-grid' }, [
        ...PRESETS.map((p) => panelButton(p.icon, p.text, () => start(p), p.label)),
        panelButton('image', I18N.t('full_yt_dl_thumb'), () => D.downloadThumb(), I18N.t('full_yt_dl_thumb_title')),
        panelButton('camera', I18N.t('full_yt_dl_snapshot'), () => D.snapshot(), I18N.t('full_yt_dl_snapshot_title')),
      ]),
      hostNote,
      statusBox,
    ]);
    YTX.ui.shield(panel);
  }

  // ---- Bộ tải trên máy -----------------------------------------------------------------
  async function checkHost(force = false) {
    if (!force && host.ok !== null && Date.now() - host.at < HOST_CACHE_MS) return host;
    const res = await send({ type: 'dl:ping' });
    host = { ok: !!(res && res.ok), at: Date.now(), error: (res && res.error) || '', code: res && res.code };
    renderHost();
    return host;
  }

  function renderHost() {
    if (!hostNote) return;
    if (host.ok === false) {
      hostNote.textContent = host.code === 'missing'
        ? I18N.t('full_yt_dl_host_missing')
        : host.error;
      hostNote.hidden = false;
    } else {
      hostNote.hidden = true;
    }
  }

  // ---- Tải video / âm thanh ------------------------------------------------------------
  async function start(preset) {
    const url = videoUrl();
    if (!url) {
      toast(I18N.t('full_yt_toast_watch_only'));
      return;
    }
    const res = await send({
      type: 'dl:start', url, title: videoTitle(), choice: preset.choice, videoId: YTX.getVideoId(),
    });
    if (!res || !res.ok) {
      toast(res && res.error ? res.error : I18N.t('full_yt_toast_download_start_failed'));
      return;
    }
    lastJob = res.job;
    render();
    toast(I18N.t('full_yt_toast_download_started', preset.label));
  }

  function render() {
    if (!panel) return;
    const job = lastJob && lastJob.videoId === YTX.getVideoId() ? lastJob : null;
    statusBox.hidden = !job;
    if (!job) return;
    statusBox.dataset.state = job.status;
    statusTitle.textContent = describeChoice(job.choice);
    statusText.textContent = describeJob(job);
    statusText.title = statusText.textContent;
    const pct = job.status === 'done' ? 100 : job.percent || 0;
    statusFill.style.width = `${Math.max(0, Math.min(100, pct))}%`;

    const actions = [];
    if (job.status === 'starting' || job.status === 'downloading' || job.status === 'processing') {
      actions.push(smallButton('close', I18N.t('full_yt_dl_cancel'), () => send({ type: 'dl:cancel', id: job.id })));
    } else if (job.status === 'done' && job.file) {
      actions.push(smallButton('play', I18N.t('full_yt_dl_open_file'), () => send({ type: 'dl:open', path: job.file })));
      actions.push(smallButton('folder', I18N.t('full_yt_dl_show_in_folder'), () => send({ type: 'dl:reveal', path: job.file })));
    }
    statusActions.replaceChildren(...actions);
    if (job.status === 'error' && job.code === 'missing') {
      host = { ok: false, at: Date.now(), code: 'missing', error: job.error };
      renderHost();
    }
  }

  function onJobUpdate(job) {
    if (!job || job.videoId !== YTX.getVideoId()) return;
    const prev = lastJob && lastJob.id === job.id ? lastJob.status : null;
    lastJob = job;
    render();
    if (prev !== job.status) {
      if (job.status === 'done') toast(I18N.t('full_yt_toast_download_done'));
      else if (job.status === 'error') toast(I18N.t('full_yt_toast_download_failed'));
    }
  }

  // ---- Ảnh -------------------------------------------------------------------------------
  D.downloadThumb = async () => {
    const id = YTX.getVideoId();
    if (!id) {
      toast(I18N.t('full_yt_toast_watch_only'));
      return;
    }
    toast(I18N.t('full_yt_toast_thumb_loading'));
    const candidates = ['maxresdefault', 'sddefault', 'hqdefault'].map((n) => `https://i.ytimg.com/vi/${id}/${n}.jpg`);
    const res = await send({
      type: 'img:download', format: 'original',
      items: [{ candidates, name: I18N.t('full_yt_thumb_filename', videoTitle()), w: 0, h: 0 }],
    });
    let msg;
    if (res && res.ok) msg = I18N.t('full_yt_toast_thumb_saved');
    else if (res && res.error) msg = I18N.t('full_yt_toast_thumb_failed_reason', res.error);
    else msg = I18N.t('full_yt_toast_thumb_failed');
    toast(msg);
  };

  // ---- Bảng chọn -----------------------------------------------------------------------
  D.isOpen = () => !!panel && panel.classList.contains('ytx-open');

  D.openPanel = () => {
    const player = YTX.getPlayer();
    if (!player) return;
    if (!panel) build();
    YTX.ui.closePanel();
    if (panel.parentElement !== player) player.append(panel);
    const bar = player.querySelector('.ytp-chrome-bottom');
    const bottom = bar ? player.clientHeight - bar.offsetTop + 8 : 64;
    panel.style.bottom = `${Math.max(48, bottom)}px`;
    render();
    renderHost();
    panel.classList.add('ytx-open');
    YTX.ui.setDownloadExpanded(true);
    checkHost();
  };

  D.closePanel = () => {
    if (!panel) return;
    panel.classList.remove('ytx-open');
    YTX.ui.setDownloadExpanded(false);
  };

  D.togglePanel = () => (D.isOpen() ? D.closePanel() : D.openPanel());

  D.contains = (target) => !!panel && panel.contains(target);

  D.onNavigate = () => {
    D.closePanel();
    render();
  };

  D.init = () => {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === 'ytx:dlUpdate') onJobUpdate(msg.job);
    });
    // Bấm ra ngoài thì đóng bảng.
    document.addEventListener('pointerdown', (e) => {
      if (!D.isOpen() || panel.contains(e.target) || YTX.ui.isDownloadButton(e.target)) return;
      D.closePanel();
    }, true);
  };
  // #full-end
})();
