/*
 * Popup – thẻ "Tải về" (bản Store: thẻ "Ảnh"):
 *  - Ảnh trên trang: quét ảnh (đoán bản lớn nhất), chọn nhiều ảnh, lưu dạng gốc/PNG/JPG/WebP;
 *    chụp khung hình video đang phát.
 * Các khối đánh dấu "full" chỉ có ở bản đầy đủ (tools/build.mjs bỏ khi build bản Store).
 */
// #full-start
// Bản đầy đủ thêm:
//  - Video & âm thanh: phân tích trang bằng yt-dlp, chọn chất lượng/định dạng, theo dõi tiến độ.
//  - Tệp & luồng video: video nhúng, tệp video trực tiếp, luồng HLS/DASH bắt được khi trang phát.
//  - Ảnh bìa video YouTube.
// #full-end
(() => {
  'use strict';
  // #full-start
  const { createIcon, fmt, describeJob, describeChoice, canonicalVideoUrl } = globalThis.YTX_SHARED;
  const ACTIVE = new Set(['starting', 'downloading', 'processing']);
  // #full-end
  /* #store-start
  const { createIcon } = globalThis.YTX_SHARED;
  #store-end */
  const { t: tr, tn, num } = globalThis.YTX_I18N; // tr: tránh trùng tên biến t ở dưới
  const $ = (id) => document.getElementById(id);
  const PREF_KEY = 'ytx-dl-pref';

  // #full-start
  // Trang video quen thuộc: tự phân tích khi mở popup.
  const AUTO_ANALYZE = [
    /^https:\/\/(www\.|m\.|music\.)?youtube\.com\/(watch\?|shorts\/|live\/)/,
    /^https:\/\/youtu\.be\//,
    /^https:\/\/(www\.)?vimeo\.com\/\d+/,
    /^https:\/\/(www\.)?dailymotion\.com\/video\//,
    /^https:\/\/(www\.)?tiktok\.com\/@[^/]+\/video\//,
    /^https:\/\/(www\.|web\.|m\.)?facebook\.com\/(.+\/videos\/\d|watch\/?\?(.*&)?v=\d|reel\/\d)/,
    /^https:\/\/fb\.watch\//,
    /^https:\/\/(www\.)?(twitter|x)\.com\/[^/]+\/status\/\d+/,
    /^https:\/\/(www\.)?instagram\.com\/(p|reel|reels|tv)\//,
    /^https:\/\/(www\.)?twitch\.tv\/videos\//,
    /^https:\/\/(www\.)?bilibili\.com\/video\//,
    /^https:\/\/soundcloud\.com\/[^/]+\/[^/]+/,
  ];

  // Mạng xã hội: địa chỉ trang thường là bảng tin, không phải video.
  const SOCIAL = /(^|\.)(facebook\.com|instagram\.com|tiktok\.com|x\.com|twitter\.com|threads\.net|reddit\.com)$/i;

  const VIDEO_FORMATS = [['mp4', 'MP4'], ['webm', 'WebM'], ['mkv', 'MKV']];
  const AUDIO_FORMATS = [['mp3', 'MP3'], ['m4a', 'M4A'], ['opus', 'Opus']];
  // Khoá chuỗi gợi ý cho từng định dạng (dịch khi hiển thị).
  const HINTS = {
    mp4: 'full_dl_hint_mp4',
    webm: 'full_dl_hint_webm',
    mkv: 'full_dl_hint_mkv',
    mp3: 'full_dl_hint_mp3',
    m4a: 'full_dl_hint_m4a',
    opus: 'full_dl_hint_opus',
  };
  // #full-end

  const state = {
    tab: null,
    pageUrl: '',
    pageTitle: '',
    scan: null,
    selected: new Set(),
    // #full-start
    target: null,     // video đang chọn: { url, referer, title }
    entries: null,    // trang có nhiều video: danh sách từ bộ tải
    info: null,
    mode: 'video',
    hostOk: false,
    media: [],
    jobs: new Map(),
    // #full-end
  };

  // ---- Tiện ích ------------------------------------------------------------------------
  function h(tag, props = {}, children = []) {
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
  }

  /** Gộp xuống dòng / khoảng trắng thừa (tiêu đề bài Facebook hay có nhiều dòng) và cắt bớt nếu quá dài. */
  function oneLine(text, max = 200) {
    const s = String(text || '').replace(/\s+/g, ' ').trim();
    return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
  }

  /** Gán chữ đã rút gọn; rê chuột vào xem bản đầy đủ. */
  function setText(el, text, max) {
    const full = String(text || '').replace(/\s+/g, ' ').trim();
    el.textContent = oneLine(full, max);
    if (full) el.title = full.slice(0, 2000);
    else el.removeAttribute('title');
  }

  async function send(msg) {
    try {
      return await chrome.runtime.sendMessage(msg);
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  }

  function loadPref() {
    try {
      return JSON.parse(localStorage.getItem(PREF_KEY)) || {};
    } catch (_) {
      return {};
    }
  }

  function savePref(patch) {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify({ ...loadPref(), ...patch }));
    } catch (_) { /* không bắt buộc */ }
  }

  const hostOf = (url) => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch (_) {
      return '';
    }
  };

  const fileOf = (url) => {
    try {
      return decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || '') || hostOf(url);
    } catch (_) {
      return url;
    }
  };

  const isYouTube = (url) => /^https:\/\/(www\.|m\.|music\.)?youtube\.com\//.test(url || '');

  // #full-start
  const youtubeId = (url) => {
    try {
      const u = new URL(url);
      return /(^|\.)youtube\.com$/.test(u.hostname) ? u.searchParams.get('v') : null;
    } catch (_) {
      return null;
    }
  };

  // ---- Bộ tải trên máy ------------------------------------------------------------------
  async function checkHost() {
    $('hostState').textContent = tr('full_dl_host_checking');
    const res = await send({ type: 'dl:ping' });
    state.hostOk = !!(res && res.ok);
    if (state.hostOk) {
      $('hostState').textContent = res.ytdlp ? `yt-dlp ${res.ytdlp}` : tr('full_dl_host_connected');
      $('hostState').title = tr('full_dl_host_save_to', res.downloadDir);
      $('hostSetup').hidden = true;
      $('videoArea').hidden = false;
      $('vHint').hidden = !!res.ffmpeg;
      if (!res.ffmpeg) $('vHint').textContent = tr('full_dl_no_ffmpeg');
    } else {
      $('hostState').textContent = '';
      $('hostSetup').hidden = false;
      $('videoArea').hidden = true;
      const missing = !res || res.code === 'missing';
      $('setupTitle').textContent = missing ? tr('full_dl_setup_missing_title') : tr('full_dl_setup_error_title');
      $('setupText').textContent = missing
        ? tr('full_dl_setup_missing_text')
        : tr('full_dl_setup_error_text', res.error);
    }
    return state.hostOk;
  }

  // ---- Phân tích video ------------------------------------------------------------------
  function showVideo(view, message = '') {
    $('vIdle').hidden = view !== 'idle' && view !== 'error';
    $('vLoading').hidden = view !== 'loading';
    $('vInfo').hidden = view !== 'info';
    $('vError').hidden = view !== 'error';
    setText($('vError'), message, 500);
    if (view === 'error') $('vAnalyze').lastChild.textContent = tr('full_dl_retry');
  }

  async function analyze(target, { refresh = false, cacheOnly = false, keepEntries = false } = {}) {
    state.target = target;
    if (!keepEntries) {
      state.entries = null;
      $('vEntry').hidden = true;
    }
    if (!cacheOnly) {
      $('vLoadingText').textContent = target.referer ? tr('full_dl_analyzing_embed') : tr('full_dl_analyzing');
      showVideo('loading');
    }
    const headers = target.referer ? { Referer: target.referer } : undefined;
    const res = await send({ type: 'dl:info', url: target.url, headers, refresh, cacheOnly });
    if (state.target !== target) return; // người dùng đã chọn video khác
    if (!res || !res.ok) {
      if (res && res.cacheMiss) return;
      showVideo('error', (res && res.error) || tr('full_dl_analyze_failed'));
      if (res && (res.code === 'missing' || res.code === 'forbidden')) checkHost();
      return;
    }
    const info = res.info;
    if (info.kind === 'playlist') {
      if (!info.entries.length) {
        showVideo('error', tr('full_dl_no_videos'));
        return;
      }
      state.entries = info.entries;
      const select = $('vEntry');
      const n = info.entries.length;
      select.replaceChildren(...info.entries.map((e, i) => h('option', {
        value: String(i), text: `${i + 1}/${n} · ${oneLine(e.title, 90)}${e.duration ? ` (${fmt.duration(e.duration)})` : ''}`,
      })));
      select.title = tn('full_dl_entries_title', n);
      select.hidden = false;
      pickEntry(0, target.url);
      return;
    }
    if (info.isLive) {
      showVideo('error', tr('full_dl_live_unsupported'));
      return;
    }
    renderInfo(info);
  }

  function pickEntry(index, referer) {
    const e = state.entries[index];
    analyze({ url: canonicalVideoUrl(e.url), referer, title: e.title }, { keepEntries: true });
  }

  function renderInfo(info) {
    state.info = info;
    const thumb = $('vThumb');
    thumb.hidden = !info.thumbnail;
    if (info.thumbnail) thumb.src = info.thumbnail;
    setText($('vTitle'), info.title || state.target.title || state.pageTitle, 300);
    setText($('vSub'), [
      info.extractor, info.uploader, info.duration ? fmt.duration(info.duration) : '',
      info.heights.length ? tr('full_dl_max_height', info.heights[0]) : tr('full_dl_audio_only_info'),
    ].filter(Boolean).join(' · '), 300);

    renderFormats();
    showVideo('info');
  }

  function heightLabel(h) {
    return `${h}p${h >= 4320 ? ' 8K' : h >= 2160 ? ' 4K' : h >= 1440 ? ' 2K' : ''}`;
  }

  /** Giá trị ô Định dạng: "v:mp4" (video) hoặc "a:mp3" (chỉ âm thanh). */
  function formatValue() {
    const [kind, name] = ($('vFormat').value || 'v:mp4').split(':');
    return { audio: kind === 'a', name };
  }

  /** Một ô Định dạng gồm 2 nhóm: Video (MP4/WebM/MKV) và Chỉ âm thanh (MP3/M4A/Opus). */
  function renderFormats() {
    const info = state.info;
    const pref = loadPref();
    const format = $('vFormat');
    const hasVideo = info.heights.length > 0;
    const groups = [];
    if (hasVideo) {
      groups.push(h('optgroup', { label: tr('full_dl_group_video') }, VIDEO_FORMATS.map(([v, t]) => h('option', { value: `v:${v}`, text: t }))));
    }
    groups.push(h('optgroup', { label: tr('full_dl_group_audio_only') },
      AUDIO_FORMATS.map(([v, t]) => h('option', { value: `a:${v}`, text: tr('full_dl_audio_format', t) }))));
    const keep = format.value;
    format.replaceChildren(...groups);
    const fromPref = pref.mode === 'audio' || !hasVideo ? `a:${pref.audioFormat || 'mp3'}` : `v:${pref.container || 'mp4'}`;
    const has = (v) => [...format.options].some((o) => o.value === v);
    format.value = has(keep) ? keep : has(fromPref) ? fromPref : format.options[0].value;
    renderQuality();
  }

  function renderQuality() {
    const info = state.info;
    const { audio, name } = formatValue();
    state.mode = audio ? 'audio' : 'video';
    const quality = $('vQuality');
    quality.hidden = audio;
    $('vRow').classList.toggle('one', audio);
    $('vFormat').title = HINTS[name] ? tr(HINTS[name]) : '';
    if (!audio) {
      const pref = loadPref();
      const sizes = (info.sizes && info.sizes[name]) || {};
      const opts = [h('option', { value: 'best', text: tr('full_dl_quality_best', heightLabel(info.heights[0])) })];
      for (const ht of info.heights) {
        opts.push(h('option', { value: String(ht), text: `${heightLabel(ht)}${sizes[ht] ? ` · ~${fmt.bytes(sizes[ht])}` : ''}` }));
      }
      const keep = quality.value;
      quality.replaceChildren(...opts);
      const want = keep && keep !== 'best' ? keep : String(pref.quality || 'best');
      quality.value = [...quality.options].some((o) => o.value === want) ? want : 'best';
    }
    renderEstimate();
  }

  function renderEstimate() {
    const info = state.info;
    const { audio, name } = formatValue();
    let size = 0;
    if (audio) {
      size = info.audioSize;
    } else {
      const q = $('vQuality').value;
      const ht = q === 'best' ? info.heights[0] : +q;
      size = ((info.sizes && info.sizes[name]) || {})[ht] || 0;
    }
    let label;
    if (audio) label = size ? tr('full_dl_download_audio_size', fmt.bytes(size)) : tr('full_dl_download_audio');
    else label = size ? tr('full_dl_download_video_size', fmt.bytes(size)) : tr('full_dl_download_video');
    $('vDownloadText').textContent = label;
  }

  function currentChoice() {
    const { audio, name } = formatValue();
    if (audio) return { mode: 'audio', audioFormat: name };
    const q = $('vQuality').value;
    return { mode: 'video', quality: q === 'best' ? 'best' : +q, container: name };
  }

  async function startDownload(url, title, choice, referer) {
    const headers = referer ? { Referer: referer, 'User-Agent': navigator.userAgent } : undefined;
    const res = await send({
      type: 'dl:start', url, title, choice, headers,
      tabId: state.tab ? state.tab.id : null, videoId: youtubeId(url),
    });
    if (res && res.ok) upsertJob(res.job);
    return res;
  }

  // ---- Danh sách đang tải ---------------------------------------------------------------
  let jobsFrame = 0;

  function upsertJob(job) {
    state.jobs.set(job.id, job);
    if (!jobsFrame) jobsFrame = requestAnimationFrame(() => { jobsFrame = 0; renderJobs(); });
  }

  function jobItem(job) {
    const active = ACTIVE.has(job.status);
    const title = oneLine(job.title, 300);
    const iconBtn = (icon, label, onclick) => h('button', {
      class: 'icon-btn', type: 'button', title: label, 'aria-label': label, onclick,
    }, [createIcon(icon)]);
    const top = h('div', { class: 'job-top' }, [h('span', { class: 'job-title', text: title, title })]);
    if (active) {
      top.append(iconBtn('close', tr('full_dl_job_cancel'), () => send({ type: 'dl:cancel', id: job.id })));
    } else if (job.status === 'done' && job.file) {
      top.append(
        iconBtn('play', tr('full_dl_job_open'), () => openFile('dl:open', job)),
        iconBtn('folder', tr('full_dl_job_reveal'), () => openFile('dl:reveal', job)),
      );
    }
    const sub = oneLine(`${describeChoice(job.choice)} — ${describeJob(job)}`, 500);
    const children = [top, h('div', { class: 'job-sub', text: sub, title: sub })];
    if (active) {
      const fill = h('i');
      fill.style.width = `${job.percent || 0}%`;
      children.push(h('div', { class: 'bar' }, [fill]));
    }
    return h('li', { class: 'job', 'data-state': job.status }, children);
  }

  async function openFile(type, job) {
    const res = await send({ type, path: job.file });
    if (res && !res.ok) {
      job.status = 'error';
      job.error = res.error;
      renderJobs();
    }
  }

  function renderJobs() {
    const list = [...state.jobs.values()]
      .sort((a, b) => (ACTIVE.has(b.status) - ACTIVE.has(a.status)) || (b.startedAt - a.startedAt))
      .slice(0, 6);
    $('jobs').replaceChildren(...list.map(jobItem));
    $('jobsClear').hidden = !list.some((j) => !ACTIVE.has(j.status));
  }

  async function loadJobs() {
    const res = await send({ type: 'dl:jobs' });
    state.jobs = new Map(((res && res.jobs) || []).map((j) => [j.id, j]));
    renderJobs();
  }

  // ---- Tệp & luồng video ----------------------------------------------------------------
  async function loadMedia() {
    if (!state.tab) return;
    const res = await send({ type: 'media:list', tabId: state.tab.id });
    state.media = (res && res.media) || [];
    renderStreams();
  }

  function streamRow(badge, name, sub, buttonText, onClick, badgeClass = '') {
    name = oneLine(name, 200);
    const status = h('span', { class: 's-sub', text: sub, title: sub });
    const btn = h('button', { class: 'ghost', type: 'button', text: buttonText });
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const msg = await onClick();
      btn.disabled = false;
      if (msg) setText(status, msg, 300);
    });
    return h('li', {}, [
      h('span', { class: `badge ${badgeClass}`.trim(), text: badge }),
      h('span', { class: 's-info' }, [h('span', { class: 's-name', text: name, title: name }), status]),
      btn,
    ]);
  }

  function renderStreams() {
    const rows = [];
    for (const p of (state.scan && state.scan.posts) || []) {
      if (p.page) continue; // chính trang này, đã ở phần Video phía trên
      let path = p.url;
      try {
        const u = new URL(p.url);
        path = `${u.hostname.replace(/^www\./, '')}${u.pathname}${u.search}`;
      } catch (_) { /* giữ nguyên */ }
      rows.push(streamRow(p.site, p.playing ? tr('full_dl_stream_playing') : tr('full_dl_stream_in_post'), path, tr('full_dl_stream_pick'), async () => {
        $('videoCard').scrollIntoView({ behavior: 'smooth' });
        analyze({ url: canonicalVideoUrl(p.url), referer: state.pageUrl, title: p.site });
        return '';
      }, 'embed'));
    }
    for (const e of (state.scan && state.scan.embeds) || []) {
      rows.push(streamRow(e.site, tr('full_dl_stream_embed', e.site), hostOf(e.url), tr('full_dl_stream_pick'), async () => {
        $('videoCard').scrollIntoView({ behavior: 'smooth' });
        analyze({ url: canonicalVideoUrl(e.url), referer: state.pageUrl, title: e.site });
        return '';
      }, 'embed'));
    }

    const seen = new Set();
    const all = [...((state.scan && state.scan.media) || []), ...state.media];
    const hasMaster = all.some((m) => m.kind === 'hls' && m.master);
    for (const m of all) {
      if (seen.has(m.url) || rows.length >= 15) continue;
      seen.add(m.url);
      if (m.kind === 'hls' && hasMaster && m.master === false) continue; // danh sách con của luồng chính
      const bits = [hostOf(m.url)];
      if (m.size) bits.push(fmt.bytes(m.size));
      if (m.h) bits.push(`${m.h}p`);
      if (m.heights && m.heights.length) bits.push(m.heights.slice(0, 4).map((x) => `${x}p`).join(', '));
      if (m.duration && Number.isFinite(m.duration)) bits.push(fmt.duration(m.duration));
      const sub = bits.join(' · ');

      if (m.kind === 'file') {
        const ext = (fileOf(m.url).match(/\.([a-z0-9]{2,4})$/i) || [])[1];
        rows.push(streamRow((ext || (m.audio ? 'AUDIO' : 'VIDEO')).toUpperCase(), fileOf(m.url), sub, tr('full_dl_stream_download'), async () => {
          const res = await send({ type: 'file:download', url: m.url, name: fileOf(m.url).replace(/\.[^.]+$/, '') });
          return res && res.ok ? tr('full_dl_stream_sent') : tr('full_dl_stream_error', (res && res.error) || '');
        }));
      } else {
        rows.push(streamRow(m.kind.toUpperCase(), state.pageTitle || fileOf(m.url), sub, tr('full_dl_stream_download'), async () => {
          if (!state.hostOk) return tr('full_dl_stream_need_host');
          const res = await startDownload(m.url, state.pageTitle || fileOf(m.url),
            { mode: 'video', quality: 'best', container: 'mp4' }, state.pageUrl);
          return res && res.ok ? tr('full_dl_stream_started') : tr('full_dl_stream_error', (res && res.error) || '');
        }));
      }
    }
    $('streams').replaceChildren(...rows);
    $('streamsCard').hidden = rows.length === 0;
    $('streamsCount').textContent = rows.length ? String(rows.length) : '';
  }
  // #full-end

  // ---- Ảnh ------------------------------------------------------------------------------
  const keyOf = (img) => img.candidates[0];

  function isSmall(img) {
    return !img.upgraded && img.w > 0 && img.h > 0 && Math.max(img.w, img.h) < 150;
  }

  function visibleImages() {
    const showSmall = $('imgSmall').checked;
    const list = ((state.scan && state.scan.images) || []).filter((img) => showSmall || !isSmall(img));
    const score = (img) => (img.w * img.h || 90000) * (img.upgraded ? 4 : 1);
    return list.sort((a, b) => score(b) - score(a));
  }

  function tile(img) {
    const key = keyOf(img);
    const dim = h('span', { class: 'dim' });
    const paintDim = () => {
      // ↑ vàng: sẽ tải bản lớn hơn ảnh đang thấy
      dim.textContent = `${img.upgraded ? '↑' : ''}${img.w ? `${img.w}×${img.h}` : img.upgraded ? 'HD' : '?'}`;
      dim.classList.toggle('up', img.upgraded);
    };
    paintDim();
    const pic = h('img', { src: img.preview, loading: 'lazy', referrerpolicy: 'no-referrer', alt: '', decoding: 'async' });
    const btn = h('button', {
      class: 'tile', type: 'button', 'aria-pressed': String(state.selected.has(key)),
      title: [img.alt, img.upgraded ? tr('dl_img_upgraded_tip') : ''].filter(Boolean).join(' · ') || fileOf(key),
    }, [pic, dim, h('span', { class: 'tick' }, [createIcon('check')])]);
    pic.addEventListener('error', () => btn.classList.add('broken'), { once: true });
    pic.addEventListener('load', () => {
      // Chưa biết kích thước (ảnh nền, thẻ meta): lấy từ ảnh xem trước nếu đúng là ảnh sẽ tải.
      if (!img.w && img.preview === key && pic.naturalWidth) {
        img.w = pic.naturalWidth;
        img.h = pic.naturalHeight;
        paintDim();
      }
    }, { once: true });
    btn.addEventListener('click', () => {
      if (state.selected.has(key)) state.selected.delete(key);
      else state.selected.add(key);
      btn.setAttribute('aria-pressed', String(state.selected.has(key)));
      renderImageActions();
    });
    return btn;
  }

  function renderImages() {
    const list = visibleImages();
    const total = ((state.scan && state.scan.images) || []).length;
    $('imgGrid').replaceChildren(...list.map(tile));
    let count = '';
    if (total) count = list.length !== total ? tn('dl_img_count_of', total, num(list.length)) : tn('dl_img_count', total);
    $('imgCount').textContent = count;
    const empty = $('imgEmpty');
    empty.hidden = list.length > 0 || !state.scan;
    if (state.scan && !list.length) {
      empty.textContent = total ? tr('dl_img_only_small') : tr('dl_img_none');
    }
    renderImageActions();
  }

  function renderImageActions() {
    const list = visibleImages();
    const chosen = list.filter((img) => state.selected.has(keyOf(img)));
    $('imgAll').disabled = !list.length;
    $('imgAll').textContent = list.length && chosen.length === list.length ? tr('dl_img_deselect') : tr('dl_img_select_all');
    $('imgDownload').disabled = !chosen.length;
    $('imgDownloadText').textContent = chosen.length ? tn('dl_img_download_n', chosen.length) : tr('dl_img_download');
  }

  function imgStatus(text) {
    const el = $('imgStatus');
    setText(el, text, 400);
    el.hidden = !text;
  }

  async function downloadImages(items, folder) {
    imgStatus(tn('dl_img_downloading', items.length));
    const res = await send({ type: 'img:download', items, format: $('imgFormat').value, quality: 0.92, folder });
    if (res && res.saved) {
      const inFolder = items.length > 1;
      let msg;
      if (res.failed) {
        msg = inFolder
          ? tn('dl_img_saved_failed_folder', res.saved, num(res.failed), res.error, folder)
          : tn('dl_img_saved_failed', res.saved, num(res.failed), res.error);
      } else {
        msg = inFolder ? tn('dl_img_saved_folder', res.saved, folder) : tn('dl_img_saved', res.saved);
      }
      imgStatus(msg);
    } else {
      imgStatus(tr('dl_img_download_failed', (res && res.error) || tr('dl_img_unknown_error')));
    }
  }

  function renderQuick() {
    // #full-start
    const vid = youtubeId(canonicalVideoUrl(state.pageUrl));
    $('thumbBtn').hidden = !vid;
    // #full-end
    const snap = state.scan && state.scan.snapshot;
    $('snapBtn').hidden = !snap;
    if (snap) {
      $('snapText').textContent = tr('dl_snap_label');
      $('snapBtn').title = tr('dl_snap_tip', snap.w, snap.h);
    }
  }

  async function scanPage() {
    const empty = $('imgEmpty');
    if (!state.tab || !/^(https?|file):/i.test(state.pageUrl)) {
      empty.textContent = tr('dl_scan_system_page');
      empty.hidden = false;
      return;
    }
    empty.textContent = tr('dl_scanning');
    empty.hidden = false;
    try {
      const target = { tabId: state.tab.id };
      await chrome.scripting.executeScript({ target, files: ['src/shared/i18n.js', 'src/page/agent.js'] });
      const [r] = await chrome.scripting.executeScript({
        target, func: () => globalThis.__CT_AGENT && globalThis.__CT_AGENT.scan(),
      });
      state.scan = (r && r.result) || null;
    } catch (err) {
      empty.textContent = /file/i.test(state.pageUrl) ? tr('dl_scan_failed_file') : tr('dl_scan_failed');
      return;
    }
    if (state.scan && state.scan.title) state.pageTitle = state.scan.title;
    renderImages();
    renderQuick();
    // #full-start
    renderStreams();
    // #full-end
  }

  // ---- Sự kiện ------------------------------------------------------------------------
  function bindEvents() {
    // #full-start
    $('vAnalyze').addEventListener('click', findAgain);
    $('vEntry').addEventListener('change', (e) => pickEntry(+e.target.value, state.pageUrl));
    $('vFormat').addEventListener('change', () => {
      const { audio, name } = formatValue();
      savePref(audio ? { mode: 'audio', audioFormat: name } : { mode: 'video', container: name });
      renderQuality();
    });
    $('vQuality').addEventListener('change', (e) => {
      savePref({ quality: e.target.value === 'best' ? 'best' : +e.target.value });
      renderEstimate();
    });
    $('vDownload').addEventListener('click', async () => {
      const btn = $('vDownload');
      btn.disabled = true;
      const t = state.target;
      const res = await startDownload(t.url, state.info.title || t.title, currentChoice(), t.referer);
      btn.disabled = false;
      if (!res || !res.ok) showVideo('error', (res && res.error) || tr('full_dl_start_failed'));
    });
    $('jobsClear').addEventListener('click', async () => {
      const res = await send({ type: 'dl:clear' });
      state.jobs = new Map(((res && res.jobs) || []).map((j) => [j.id, j]));
      renderJobs();
    });
    $('recheckHost').addEventListener('click', async () => {
      if (await checkHost()) autoAnalyze();
    });
    $('copyId').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(chrome.runtime.id);
        $('copyId').textContent = tr('full_dl_copied');
      } catch (_) { /* không bắt buộc */ }
    });
    // #full-end

    // Ảnh
    const pref = loadPref();
    if (pref.imgFormat) $('imgFormat').value = pref.imgFormat;
    $('imgSmall').checked = !!pref.imgSmall;
    $('imgFormat').addEventListener('change', (e) => savePref({ imgFormat: e.target.value }));
    $('imgSmall').addEventListener('change', (e) => {
      savePref({ imgSmall: e.target.checked });
      renderImages();
    });
    $('imgAll').addEventListener('click', () => {
      const list = visibleImages();
      const all = list.every((img) => state.selected.has(keyOf(img)));
      for (const img of list) {
        if (all) state.selected.delete(keyOf(img));
        else state.selected.add(keyOf(img));
      }
      renderImages();
    });
    $('imgDownload').addEventListener('click', () => {
      const items = visibleImages()
        .filter((img) => state.selected.has(keyOf(img)))
        .map((img) => ({ candidates: img.candidates, name: img.name, w: img.w, h: img.h }));
      if (items.length) downloadImages(items, state.pageTitle || hostOf(state.pageUrl));
    });
    // #full-start
    $('thumbBtn').addEventListener('click', () => {
      const id = youtubeId(canonicalVideoUrl(state.pageUrl));
      if (!id) return;
      const candidates = ['maxresdefault', 'sddefault', 'hqdefault'].map((n) => `https://i.ytimg.com/vi/${id}/${n}.jpg`);
      const title = (state.info && youtubeId(state.target.url) === id && state.info.title) || state.pageTitle;
      downloadImages([{ candidates, name: tr('full_dl_thumb_name', title), w: 0, h: 0 }], '');
    });
    // #full-end
    $('snapBtn').addEventListener('click', async () => {
      const format = $('imgFormat').value === 'original' ? 'png' : $('imgFormat').value;
      try {
        const [r] = await chrome.scripting.executeScript({
          target: { tabId: state.tab.id },
          func: (f) => globalThis.__CT_AGENT.snapshot(f, 0.95),
          args: [format],
        });
        const res = r && r.result;
        imgStatus(res && res.ok ? tr('dl_snap_done', res.width, res.height, res.name) : (res && res.error) || tr('dl_snap_failed'));
      } catch (err) {
        imgStatus(tr('dl_snap_failed_detail', err.message));
      }
    });

    // #full-start
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === 'dl:update' && msg.job) upsertJob(msg.job);
      return undefined;
    });
    // #full-end
  }

  // #full-start
  /**
   * Chọn video để phân tích:
   *  1. Trang của một video (YouTube watch, reel, bài viết...) -> chính trang đó.
   *  2. Bảng tin / trang cá nhân -> bài viết chứa video đang phát (hoặc hiện rõ nhất).
   *  3. Mạng xã hội mà chưa thấy video -> hướng dẫn bấm phát video.
   *  4. Trang khác -> địa chỉ trang (yt-dlp tự tìm video nhúng).
   */
  function pickTarget() {
    const posts = (state.scan && state.scan.posts) || [];
    if (AUTO_ANALYZE.some((re) => re.test(state.pageUrl))) {
      return { url: canonicalVideoUrl(state.pageUrl), referer: '', title: state.pageTitle, known: true };
    }
    if (posts.length) {
      const p = posts[0];
      return { url: canonicalVideoUrl(p.url), referer: p.page ? '' : state.pageUrl, title: p.site, known: true };
    }
    if (SOCIAL.test(hostOf(state.pageUrl))) return { feed: true };
    return { url: canonicalVideoUrl(state.pageUrl), referer: '', title: state.pageTitle, known: false };
  }

  function autoAnalyze() {
    if (!/^https?:/i.test(state.pageUrl)) {
      $('vIdleText').textContent = tr('full_dl_unavailable_page');
      $('vAnalyze').disabled = true;
      return;
    }
    const target = pickTarget();
    if (target.feed) {
      $('vIdleText').textContent = tr('full_dl_feed_hint');
      $('vAnalyze').lastChild.textContent = tr('full_dl_find_playing');
      return;
    }
    // Biết chắc là video: phân tích ngay; trang khác: chỉ dùng kết quả cũ nếu có.
    analyze(target, { cacheOnly: !target.known });
  }

  /** Nút "Tìm video": quét lại trang (video đang phát có thể đã đổi) rồi phân tích. */
  async function findAgain() {
    $('vAnalyze').disabled = true;
    await scanPage();
    $('vAnalyze').disabled = false;
    const target = pickTarget();
    if (target.feed) {
      showVideo('error', tr('full_dl_feed_retry'));
      return;
    }
    analyze(target, { refresh: true });
  }
  // #full-end

  // ---- Khởi động (khi mở thẻ Tải về lần đầu) -------------------------------------------
  let started = false;
  let ready = null; // đã biết tab đang mở

  async function start() {
    if (started) return;
    started = true;
    await ready;
    // #full-start
    $('extId').textContent = chrome.runtime.id;
    bindEvents();
    loadJobs();
    loadMedia();
    // Cần kết quả quét trang (video đang phát trên bảng tin) trước khi chọn video để phân tích.
    const [hostOk] = await Promise.all([checkHost(), scanPage()]);
    if (hostOk) autoAnalyze();
    // #full-end
    /* #store-start
    bindEvents();
    await scanPage();
    #store-end */
  }

  document.addEventListener('ytx-tab', (e) => {
    if (e.detail === 'tab-download') start();
  });

  ready = chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
    state.tab = tab || null;
    state.pageUrl = (tab && tab.url) || '';
    state.pageTitle = (tab && tab.title) || '';
  });

  (async () => {
    await ready;
    const tabs = globalThis.POPUP_TABS;
    // Không phải YouTube: thẻ Video (xoay, tắt đèn...) không dùng được -> mở thẻ Âm thanh (không ghi nhớ).
    if (tabs.current() === 'tab-control' && !isYouTube(state.pageUrl)) tabs.select('tab-audio', false);
    if (tabs.current() === 'tab-download') start();
  })();
})();
