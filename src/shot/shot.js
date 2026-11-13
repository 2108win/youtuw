/*
 * Trang kết quả chụp màn hình: lấy các khung từ service worker, ghép thành một ảnh,
 * cho xem trước (bấm ảnh để xem cỡ thật), tải PNG / JPG, sao chép vào bộ nhớ tạm.
 */
(() => {
  'use strict';
  const { t, num, apply } = globalThis.YTX_I18N;
  apply(); // điền chữ cho [data-i18n] trong shot.html
  const $ = (id) => document.getElementById(id);
  const id = location.hash.slice(1);
  const MAX_SIDE = 32000;       // giới hạn cạnh canvas của Chrome (~32767 px)
  const MAX_AREA = 250e6;       // giới hạn diện tích canvas (~268 triệu điểm ảnh)

  let canvas = null;
  let pngBlob = null;
  let baseName = t('shot_file_name_default');

  async function send(msg) {
    try {
      return await chrome.runtime.sendMessage(msg);
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  }

  function status(text, { error = false, action = null } = {}) {
    const el = $('status');
    el.replaceChildren(text);
    if (action) el.append(action);
    el.classList.toggle('err', error);
    el.hidden = !text;
  }

  function sanitize(name) {
    return String(name || '').normalize('NFC')
      .replace(/[\u0000-\u001f\u007f<>:"/\\|?*~]+/g, ' ')
      .replace(/\s+/g, ' ').trim().replace(/^[.\s]+|[.\s]+$/g, '').slice(0, 90) || t('shot_file_name_page');
  }

  function stamp(t) {
    const d = new Date(t);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(t('shot_err_read_image')));
      img.src = src;
    });
  }

  const toBlob = (type, quality) => new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error(t('shot_err_too_large')))), type, quality);
  });

  /** Ghép các khung (mỗi khung = một màn hình, kèm vị trí cuộn y) thành một ảnh. */
  function stitch(meta, frames, images) {
    // Điểm ảnh thật trên 1 px CSS (màn hình 125%...). Ảnh chụp gồm cả thanh cuộn nếu còn hiện,
    // nên chia cho bề rộng cửa sổ (captureWidth) chứ không phải bề rộng nội dung.
    const scale = images[0].naturalWidth / (meta.captureWidth || meta.viewWidth);
    let sx = 0;
    let sy = 0;
    let width = images[0].naturalWidth;
    let height = images[0].naturalHeight;
    if (meta.mode === 'full') {
      height = Math.max(...frames.map((f, i) => Math.round(f.y * scale) + images[i].naturalHeight));
    } else if (meta.mode === 'region' && meta.rect) {
      sx = Math.round(meta.rect.x * scale);
      sy = Math.round(meta.rect.y * scale);
      width = Math.round(meta.rect.width * scale);
      height = Math.round(meta.rect.height * scale);
    }
    // Trang quá dài so với giới hạn canvas: thu nhỏ cả ảnh cho vừa.
    const k = Math.min(1, MAX_SIDE / width, MAX_SIDE / height, Math.sqrt(MAX_AREA / (width * height)));
    canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * k));
    canvas.height = Math.max(1, Math.round(height * k));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = 'high';
    frames.forEach((f, i) => {
      const img = images[i];
      const top = meta.mode === 'full' ? Math.round(f.y * scale) : 0;
      ctx.drawImage(img, (0 - sx) * k, (top - sy) * k, img.naturalWidth * k, img.naturalHeight * k);
    });
    return { k, cssWidth: Math.round(width / scale), cssHeight: Math.round(height / scale) };
  }

  async function download(blob, ext) {
    const url = URL.createObjectURL(blob);
    try {
      const downloadId = await chrome.downloads.download({ url, filename: `${baseName}.${ext}`, conflictAction: 'uniquify' });
      const open = document.createElement('button');
      open.type = 'button';
      open.textContent = t('shot_open_folder');
      open.addEventListener('click', () => chrome.downloads.show(downloadId));
      status(t('shot_saved', ext.toUpperCase()), { action: open });
    } catch (err) {
      status(t('shot_save_failed', err.message), { error: true });
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
  }

  async function main() {
    const res = await send({ type: 'shot:meta', id });
    if (!res || !res.ok) {
      $('title').textContent = t('shot_gone_title');
      $('loading').hidden = true;
      status(t('shot_expired'), { error: true });
      return;
    }
    const meta = res.meta;
    $('title').textContent = meta.title || meta.url;
    $('title').title = meta.url;
    document.title = t('shot_doc_title', meta.title || meta.url);
    baseName = t('shot_file_name', sanitize(meta.title), stamp(meta.time));

    const frames = [];
    for (let i = 0; i < meta.count; i += 1) {
      $('loadingText').textContent = meta.count > 1 ? t('shot_stitching_progress', i + 1, meta.count) : t('shot_processing');
      const f = await send({ type: 'shot:frame', id, index: i });
      if (!f || !f.ok) throw new Error(t('shot_err_missing_frame'));
      frames.push(f);
    }
    send({ type: 'shot:done', id }); // giải phóng bộ nhớ của service worker
    const images = await Promise.all(frames.map((f) => loadImage(f.dataUrl)));
    const { k, cssWidth, cssHeight } = stitch(meta, frames, images);

    pngBlob = await toBlob('image/png');
    const img = document.createElement('img');
    img.src = URL.createObjectURL(pngBlob);
    img.alt = t('shot_img_alt', meta.title || '');
    img.title = t('shot_img_hint');
    img.addEventListener('click', () => img.classList.toggle('actual'));
    $('view').replaceChildren(img);

    const mode = { full: t('shot_mode_full'), visible: t('shot_mode_visible'), region: t('shot_mode_region') }[meta.mode];
    const parts = [mode, `${canvas.width} × ${canvas.height} px`, `${(pngBlob.size / 1048576).toFixed(1)} MB`];
    if (k < 1) parts.push(t('shot_meta_scaled'));
    if (meta.truncated) parts.push(t('shot_meta_truncated', num(cssHeight)));
    $('meta').textContent = parts.join(' · ');
    $('meta').title = t('shot_meta_css_size', cssWidth, cssHeight);
    for (const b of ['savePng', 'saveJpg', 'copy']) $(b).disabled = false;
  }

  $('savePng').addEventListener('click', () => download(pngBlob, 'png'));
  $('saveJpg').addEventListener('click', async () => download(await toBlob('image/jpeg', 0.92), 'jpg'));
  $('copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
      status(t('shot_copied'));
    } catch (err) {
      status(t('shot_copy_failed', err.message), { error: true });
    }
  });

  main().catch((err) => {
    $('loading').hidden = true;
    status(String(err.message || err), { error: true });
  });
})();
