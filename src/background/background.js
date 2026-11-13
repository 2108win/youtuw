/*
 * Service worker:
 *  - Ảnh: tải bản gốc hoặc đổi sang PNG / JPG / WebP (xử lý trong trang offscreen).
 *  - Âm lượng từng tab, chụp màn hình, phím tắt toàn cục (cửa sổ nổi, chụp cả trang).
 * Các khối đánh dấu "full" chỉ có ở bản đầy đủ (tools/build.mjs bỏ khi build bản Store).
 */
// #full-start
// Bản đầy đủ thêm:
//  - Video / âm thanh: gọi bộ tải yt-dlp trên máy (native messaging), theo dõi tiến độ, huỷ.
//  - Dò luồng video trang web đang phát (m3u8, mpd, mp4...) để tải trực tiếp.
// #full-end
'use strict';

importScripts('/src/shared/i18n.js', '/src/shared/shared.js'); // YTX_I18N (chuỗi giao diện), YTX_SHARED.pipInTab dùng chung với popup
const { t } = globalThis.YTX_I18N;

// #full-start
const HOST = 'com.cinematools.downloader';
const MAX_JOBS = 20;
const ACTIVE = new Set(['starting', 'downloading', 'processing']);
const validQuality = (q) => q === 'best' || (Number.isInteger(q) && q >= 100 && q <= 8640);
const CONTAINERS = new Set(['mp4', 'webm', 'mkv']);
const AUDIO_FORMATS = new Set(['mp3', 'm4a', 'opus']);
// #full-end
const IMAGE_FORMATS = new Set(['original', 'png', 'jpeg', 'webp']);
// Đường dự phòng "lưu bản gốc" chỉ dành cho tệp ảnh (không để trang web cài .mp4 / .exe vào danh sách ảnh).
const IMAGE_EXTS = new Set(['jpg', 'jfif', 'png', 'gif', 'webp', 'avif', 'bmp', 'svg', 'tif', 'tiff', 'ico', 'heic', 'jxl']);

// ---- Tiện ích ------------------------------------------------------------------------
/** Tên tệp an toàn cho chrome.downloads (không ký tự cấm, không tên dành riêng của Windows). */
function sanitize(name, max = 120) {
  let s = String(name || '')
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*​-‏‪-‮~]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, '');
  if (s.length > max) s = s.slice(0, max).replace(/[.\s]+$/, '');
  if (/^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(s)) s = `_${s}`;
  return s;
}

function buildFilename(folder, name, ext) {
  const file = `${sanitize(name) || sanitize(t('bg_file_name_default')) || 'file'}.${ext}`;
  const dir = sanitize(folder, 80);
  return dir ? `${dir}/${file}` : file;
}

function extFromUrl(url) {
  try {
    const m = new URL(url).pathname.match(/\.([a-z0-9]{2,5})$/i);
    return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : '';
  } catch (_) {
    return '';
  }
}

function isHttpUrl(url) {
  return typeof url === 'string' && /^https?:\/\/\S+$/i.test(url) && url.length <= 4096;
}

/** Gửi tin nhắn tới mọi trang của extension đang mở (popup, offscreen); bỏ qua nếu không có ai nghe. */
function broadcastRuntime(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {});
}

// #full-start
// ---- Bộ tải trên máy (native messaging) ------------------------------------------------
function hostError(message = '') {
  if (/not found/i.test(message)) {
    return { code: 'missing', text: t('full_bg_host_missing') };
  }
  if (/forbidden/i.test(message)) {
    return { code: 'forbidden', text: t('full_bg_host_forbidden') };
  }
  if (/exited/i.test(message)) {
    return { code: 'crash', text: t('full_bg_host_crash') };
  }
  return { code: 'error', text: message || t('full_bg_host_unreachable') };
}

function nativeCall(msg) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendNativeMessage(HOST, msg, (res) => {
        const err = chrome.runtime.lastError;
        if (err) {
          const e = hostError(err.message);
          resolve({ ok: false, error: e.text, code: e.code });
        } else {
          resolve(res || { ok: false, error: t('full_bg_host_no_reply') });
        }
      });
    } catch (err) {
      const e = hostError(String(err && err.message));
      resolve({ ok: false, error: e.text, code: e.code });
    }
  });
}

function validChoice(c) {
  if (!c || typeof c !== 'object') return null;
  if (c.mode === 'audio' && AUDIO_FORMATS.has(c.audioFormat)) return { mode: 'audio', audioFormat: c.audioFormat };
  if (c.mode === 'video' && validQuality(c.quality) && CONTAINERS.has(c.container)) {
    return { mode: 'video', quality: c.quality, container: c.container };
  }
  return null;
}

function validHeaders(h) {
  const out = {};
  if (!h || typeof h !== 'object') return out;
  for (const key of ['Referer', 'User-Agent', 'Origin']) {
    const v = h[key];
    if (typeof v === 'string' && v.length <= 2048 && !/[\r\n]/.test(v)) out[key] = v;
  }
  return out;
}

// ---- Phiên đăng nhập (cookie) cho trang cần đăng nhập ------------------------------------
// Không gửi cookie YouTube/Google: dùng chúng ngoài trình duyệt dễ bị Google đánh dấu tài khoản.
const NO_COOKIE_HOSTS = /(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com|google\.com|googlevideo\.com)$/i;
const DOMAIN_ALIASES = {
  'fb.watch': ['facebook.com'], 'instagr.am': ['instagram.com'], 'x.com': ['twitter.com'], 'twitter.com': ['x.com'],
};
const SECOND_LEVEL = /^(com|net|org|edu|gov|co|ac)\.[a-z]{2}$/i;

function baseDomain(host) {
  const parts = host.toLowerCase().split('.');
  if (parts.length <= 2) return parts.join('.');
  const last2 = parts.slice(-2).join('.');
  return SECOND_LEVEL.test(last2) ? parts.slice(-3).join('.') : last2;
}

/** Cookie của trang chứa video (để yt-dlp tải được video cần đăng nhập). Chỉ gửi cho bộ tải trên máy. */
async function cookiesFor(url) {
  let host;
  try {
    host = new URL(url).hostname;
  } catch (_) {
    return [];
  }
  if (NO_COOKIE_HOSTS.test(host) || !chrome.cookies) return [];
  const { settings } = await chrome.storage.local.get('settings');
  if (settings && settings.dlCookies === false) return [];
  const base = baseDomain(host);
  const out = [];
  const seen = new Set();
  for (const domain of [base, ...(DOMAIN_ALIASES[base] || [])]) {
    let list = [];
    try {
      list = await chrome.cookies.getAll({ domain });
    } catch (_) { /* bỏ qua */ }
    for (const c of list) {
      const key = `${c.domain}|${c.path}|${c.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const bare = c.domain.replace(/^\./, '');
      out.push({
        domain: c.hostOnly ? bare : `.${bare}`,
        name: c.name,
        value: c.value,
        path: c.path || '/',
        secure: !!c.secure,
        httpOnly: !!c.httpOnly,
        expires: c.session ? 0 : Math.floor(c.expirationDate || 0),
      });
      if (out.length >= 300) return out;
    }
  }
  return out;
}

// ---- Thông tin video (có bộ nhớ đệm trong phiên) ---------------------------------------
const INFO_TTL = 15 * 60 * 1000;

async function getInfo({ url, headers, refresh, cacheOnly }) {
  if (!isHttpUrl(url)) return { ok: false, error: t('full_bg_invalid_url') };
  const key = `info:${url}`;
  if (!refresh) {
    const cached = (await chrome.storage.session.get(key))[key];
    if (cached && Date.now() - cached.time < INFO_TTL) return cached.res;
  }
  if (cacheOnly) return { ok: false, cacheMiss: true };
  const res = await nativeCall({ cmd: 'info', url, headers: validHeaders(headers), cookies: await cookiesFor(url) });
  if (res && res.ok) {
    await chrome.storage.session.set({ [key]: { time: Date.now(), res } });
  }
  return res;
}

// ---- Danh sách tải video ------------------------------------------------------------------
const jobs = new Map();
const ports = new Map();
let restored = null;
let persistTimer = 0;
let badgeClearTimer = 0;

function restoreJobs() {
  if (!restored) {
    restored = chrome.storage.session.get('dlJobs').then(({ dlJobs }) => {
      for (const job of dlJobs || []) {
        if (jobs.has(job.id)) continue;
        // Service worker khởi động lại => kết nối tới bộ tải đã mất.
        if (ACTIVE.has(job.status)) {
          job.status = 'error';
          job.error = t('full_bg_job_interrupted');
        }
        jobs.set(job.id, job);
      }
    });
  }
  return restored;
}

function persist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    chrome.storage.session.set({ dlJobs: [...jobs.values()] });
  }, 250);
}

function trimJobs() {
  const finished = [...jobs.values()].filter((j) => !ACTIVE.has(j.status));
  while (jobs.size > MAX_JOBS && finished.length) jobs.delete(finished.shift().id);
}

function updateBadge() {
  const active = [...jobs.values()].filter((j) => ACTIVE.has(j.status));
  clearTimeout(badgeClearTimer);
  if (active.length > 1) {
    chrome.action.setBadgeBackgroundColor({ color: '#ff6a4d' });
    chrome.action.setBadgeText({ text: `${active.length}↓` });
  } else if (active.length === 1) {
    const j = active[0];
    const text = j.status === 'downloading' && j.percent != null ? `${Math.floor(j.percent)}%` : '…';
    chrome.action.setBadgeBackgroundColor({ color: '#ff6a4d' });
    chrome.action.setBadgeText({ text });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

function flashBadgeDone() {
  chrome.action.setBadgeBackgroundColor({ color: '#2e9e5b' });
  chrome.action.setBadgeText({ text: '✓' });
  clearTimeout(badgeClearTimer);
  badgeClearTimer = setTimeout(() => updateBadge(), 5000);
}

function changed(job) {
  persist();
  if (job.status === 'done' && ![...jobs.values()].some((j) => ACTIVE.has(j.status))) flashBadgeDone();
  else updateBadge();
  broadcastRuntime({ type: 'dl:update', job });
  if (job.tabId != null) chrome.tabs.sendMessage(job.tabId, { type: 'ytx:dlUpdate', job }).catch(() => {});
}

function closePort(id) {
  const port = ports.get(id);
  ports.delete(id);
  try { port && port.disconnect(); } catch (_) { /* đã đóng */ }
}

function onHostMessage(job, m) {
  if (!m || typeof m !== 'object') return;
  switch (m.type) {
    case 'progress':
      job.status = 'downloading';
      job.part = m.part || null;
      job.height = m.height || job.height || null;
      job.percent = m.status === 'finished' ? 100 : (typeof m.percent === 'number' ? m.percent : null);
      job.speed = m.speed || null;
      job.eta = m.eta ?? null;
      job.total = m.total || null;
      job.downloaded = m.downloaded || null;
      break;
    case 'status':
      job.status = 'processing';
      job.stage = m.stage || '';
      break;
    case 'done':
      job.status = 'done';
      job.file = m.file || null;
      job.size = m.size || null;
      job.title = m.title || job.title;
      job.percent = 100;
      job.finishedAt = Date.now();
      closePort(job.id);
      break;
    case 'cancelled':
      job.status = 'cancelled';
      closePort(job.id);
      break;
    case 'error':
      job.status = 'error';
      job.error = m.error || t('full_bg_unknown_error');
      closePort(job.id);
      break;
    default:
      if (m.ok === false) {
        job.status = 'error';
        job.error = m.error || t('full_bg_unknown_error');
        closePort(job.id);
      } else {
        return;
      }
  }
  changed(job);
}

async function startJob(msg, sender) {
  await restoreJobs();
  const choice = validChoice(msg.choice);
  if (!isHttpUrl(msg.url)) return { ok: false, error: t('full_bg_invalid_url') };
  if (!choice) return { ok: false, error: t('full_bg_invalid_choice') };

  const job = {
    id: Math.random().toString(36).slice(2, 10),
    url: msg.url,
    title: String(msg.title || msg.url).slice(0, 300),
    choice,
    tabId: sender.tab ? sender.tab.id : (Number.isInteger(msg.tabId) ? msg.tabId : null),
    videoId: typeof msg.videoId === 'string' ? msg.videoId : null,
    status: 'starting',
    percent: null,
    startedAt: Date.now(),
  };
  jobs.set(job.id, job);
  trimJobs();
  const cookies = await cookiesFor(job.url);

  let port;
  try {
    port = chrome.runtime.connectNative(HOST);
  } catch (err) {
    job.status = 'error';
    job.error = hostError(String(err && err.message)).text;
    changed(job);
    return { ok: true, job };
  }
  ports.set(job.id, port);
  port.onMessage.addListener((m) => onHostMessage(job, m));
  port.onDisconnect.addListener(() => {
    const err = chrome.runtime.lastError;
    ports.delete(job.id);
    if (ACTIVE.has(job.status)) {
      const e = hostError(err ? err.message : '');
      job.status = 'error';
      job.error = err ? e.text : t('full_bg_host_stopped');
      job.code = e.code;
      changed(job);
    }
  });
  port.postMessage({ cmd: 'download', url: job.url, headers: validHeaders(msg.headers), cookies, ...choice });
  changed(job);
  return { ok: true, job };
}

async function cancelJob({ id }) {
  await restoreJobs();
  const job = jobs.get(id);
  const port = ports.get(id);
  if (!job || !ACTIVE.has(job.status)) return { ok: false };
  if (port) {
    try { port.postMessage({ cmd: 'cancel' }); } catch (_) { /* đã đóng */ }
    // Nếu bộ tải không trả lời (đang ghép bằng ffmpeg...), đóng hẳn kết nối.
    setTimeout(() => {
      if (ACTIVE.has(job.status)) {
        closePort(id);
        job.status = 'cancelled';
        changed(job);
      }
    }, 8000);
  } else {
    job.status = 'cancelled';
    changed(job);
  }
  return { ok: true };
}

async function listJobs() {
  await restoreJobs();
  return { ok: true, jobs: [...jobs.values()] };
}

async function clearJobs() {
  await restoreJobs();
  for (const job of [...jobs.values()]) if (!ACTIVE.has(job.status)) jobs.delete(job.id);
  persist();
  updateBadge();
  return listJobs();
}
// #full-end
/* #store-start
// Bản Store không có lượt tải video: huy hiệu chỉ dùng tạm khi chụp màn hình / báo lỗi cửa sổ nổi.
function updateBadge() {
  chrome.action.setBadgeText({ text: '' });
}
#store-end */

// ---- Ảnh: tải bản gốc / đổi định dạng ------------------------------------------------------
const OFFSCREEN_URL = 'src/background/offscreen.html';
let offscreenReady = null;
const blobDownloads = new Map(); // id lượt tải -> blob URL trong offscreen (thu hồi khi xong)

async function ensureOffscreen() {
  if (chrome.offscreen.hasDocument && (await chrome.offscreen.hasDocument())) return;
  if (!offscreenReady) {
    offscreenReady = chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ['BLOBS', 'USER_MEDIA'],
      justification: 'Convert images for download; boost tab volume (capture tab audio and amplify it)',
    }).catch((err) => {
      if (!/single offscreen/i.test(String(err && err.message))) throw err;
    }).finally(() => { offscreenReady = null; });
  }
  await offscreenReady;
}

// Trang offscreen không có chrome.i18n nên trả mã lỗi (kèm args cho $1…); dịch ở đây trước khi gửi tới giao diện.
// Lỗi khác (của trình duyệt: fetch, getUserMedia...) giữ nguyên.
const OFFSCREEN_ERRORS = new Set([
  'bg_img_private_host', 'bg_img_server_status', 'bg_img_too_large', 'bg_img_not_image', 'bg_img_bad_size',
  'bg_img_unreadable', 'bg_img_failed',
]);

function offscreenError(errorCode, args) {
  return OFFSCREEN_ERRORS.has(errorCode) ? t(errorCode, ...(Array.isArray(args) ? args : [])) : errorCode;
}

async function downloadOneImage(item, format, quality, folder) {
  const candidates = (item.candidates || []).filter((u) => isHttpUrl(u) || /^data:image\//.test(u)).slice(0, 6);
  if (!candidates.length) throw new Error(t('bg_img_no_url'));
  const res = await chrome.runtime.sendMessage({
    type: 'off:image', candidates, format, quality, minW: item.w || 0, minH: item.h || 0,
  });
  if (res && res.ok) {
    const id = await chrome.downloads.download({
      url: res.blobUrl, filename: buildFilename(folder, item.name, res.ext), conflictAction: 'uniquify',
    });
    blobDownloads.set(id, res.blobUrl);
    return;
  }
  // Không tự tải được (máy chủ chặn...): để trình duyệt tải bản gốc như bấm "Lưu ảnh".
  const fallback = candidates[candidates.length - 1];
  const ext = extFromUrl(fallback);
  if (format === 'original' && isHttpUrl(fallback) && IMAGE_EXTS.has(ext)) {
    await chrome.downloads.download({
      url: fallback, filename: buildFilename(folder, item.name, ext), conflictAction: 'uniquify',
    });
    return;
  }
  throw new Error(res && res.error ? offscreenError(res.error, res.args) : t('bg_img_failed'));
}

async function downloadImages({ items, format, quality, folder }) {
  if (!Array.isArray(items) || !items.length) return { ok: false, error: t('bg_img_none_selected') };
  if (!IMAGE_FORMATS.has(format)) format = 'original';
  const q = Math.min(1, Math.max(0.5, Number(quality) || 0.92));
  await ensureOffscreen();
  const queue = items.slice(0, 500);
  const single = queue.length === 1;
  let saved = 0;
  let failed = 0;
  let lastError = '';
  async function worker() {
    while (queue.length) {
      const item = queue.shift();
      try {
        await downloadOneImage(item, format, q, single ? '' : folder);
        saved += 1;
      } catch (err) {
        failed += 1;
        lastError = String(err && err.message);
      }
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  return { ok: saved > 0, saved, failed, error: failed ? lastError : '' };
}

chrome.downloads.onChanged.addListener((delta) => {
  const state = delta.state && delta.state.current;
  if (!state || state === 'in_progress' || !blobDownloads.has(delta.id)) return;
  broadcastRuntime({ type: 'off:revoke', url: blobDownloads.get(delta.id) });
  blobDownloads.delete(delta.id);
});

// #full-start
async function downloadFile({ url, name }) {
  if (!isHttpUrl(url)) return { ok: false, error: t('full_bg_invalid_url') };
  const ext = extFromUrl(url);
  const opts = { url, conflictAction: 'uniquify' };
  if (name && ext) opts.filename = buildFilename('', name, ext);
  try {
    await chrome.downloads.download(opts);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err && err.message) };
  }
}

// ---- Dò luồng video trên trang ---------------------------------------------------------------
const mediaByTab = new Map();
const MEDIA_EXT = /\.(m3u8|mpd|mp4|webm|mov|m4v|mkv|flv|mp3|m4a|ogg|oga|wav|flac)$/i;
const SKIP_HOSTS = /(^|\.)(googlevideo\.com|youtube\.com|ytimg\.com|doubleclick\.net|googlesyndication\.com)$/i;

async function getMedia(tabId) {
  if (!mediaByTab.has(tabId)) {
    const key = `media:${tabId}`;
    const list = (await chrome.storage.session.get(key))[key] || [];
    if (!mediaByTab.has(tabId)) mediaByTab.set(tabId, list);
  }
  return mediaByTab.get(tabId);
}

function saveMedia(tabId) {
  chrome.storage.session.set({ [`media:${tabId}`]: mediaByTab.get(tabId) || [] });
}

/** Danh sách phát HLS: phân biệt danh sách chính (nhiều độ phân giải) với danh sách con. */
async function inspectHls(tabId, item) {
  try {
    const res = await fetch(item.url, { credentials: 'include' });
    const text = (await res.text()).slice(0, 200000);
    item.master = text.includes('#EXT-X-STREAM-INF');
    if (item.master) {
      const heights = [...text.matchAll(/RESOLUTION=\d+x(\d+)/g)].map((m) => +m[1]);
      item.heights = [...new Set(heights)].sort((a, b) => b - a);
    }
  } catch (_) {
    item.master = null;
  }
  saveMedia(tabId);
}

async function recordMedia(details) {
  const { tabId, url, type } = details;
  if (tabId < 0 || details.statusCode >= 400) return;
  let u;
  try { u = new URL(url); } catch (_) { return; }
  if (SKIP_HOSTS.test(u.hostname)) return;

  const headers = {};
  for (const h of details.responseHeaders || []) headers[h.name.toLowerCase()] = h.value || '';
  const mime = (headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  const path = u.pathname.toLowerCase();
  const ext = (path.match(MEDIA_EXT) || [])[1] || '';
  const direct = type === 'media' || type === 'main_frame' || type === 'sub_frame';

  let kind = null;
  if (ext === 'm3u8' || mime.includes('mpegurl')) kind = 'hls';
  else if (ext === 'mpd' || mime.includes('dash+xml')) kind = 'dash';
  else if (direct && (mime.startsWith('video/') || mime.startsWith('audio/') || ext)) kind = 'file';
  if (!kind || mime === 'video/mp2t') return;

  let size = 0;
  const range = (headers['content-range'] || '').match(/\/(\d+)\s*$/);
  if (range) size = +range[1];
  else if (headers['content-length']) size = +headers['content-length'];
  if (kind === 'file' && size && size < 300 * 1024) return; // quá nhỏ: hiệu ứng, quảng cáo

  const list = await getMedia(tabId);
  if (list.some((m) => m.url === url)) return;
  const item = {
    url, kind, size, time: Date.now(),
    mime: mime || (ext ? `.${ext}` : ''),
    audio: mime.startsWith('audio/') || /^(mp3|m4a|ogg|oga|wav|flac)$/.test(ext),
  };
  list.push(item);
  while (list.length > 40) list.shift();
  saveMedia(tabId);
  if (kind === 'hls' && list.filter((m) => m.kind === 'hls').length <= 12) inspectHls(tabId, item);
}

const MEDIA_URL_PATTERNS = ['m3u8', 'mpd', 'mp4', 'webm', 'mov', 'm4v', 'mkv', 'flv'].map((e) => `*://*/*.${e}*`);

chrome.webRequest.onResponseStarted.addListener(
  (d) => { recordMedia(d); },
  { urls: ['<all_urls>'], types: ['media'] },
  ['responseHeaders'],
);
chrome.webRequest.onResponseStarted.addListener(
  (d) => { if (d.type !== 'media') recordMedia(d); },
  { urls: MEDIA_URL_PATTERNS, types: ['xmlhttprequest', 'other', 'main_frame', 'sub_frame'] },
  ['responseHeaders'],
);
// Trang mới mở trong tab -> bỏ danh sách cũ.
chrome.webRequest.onBeforeRequest.addListener(
  (d) => {
    if (d.tabId < 0) return;
    mediaByTab.set(d.tabId, []);
    saveMedia(d.tabId);
  },
  { urls: ['<all_urls>'], types: ['main_frame'] },
);
chrome.tabs.onRemoved.addListener((tabId) => {
  mediaByTab.delete(tabId);
  chrome.storage.session.remove(`media:${tabId}`);
});

async function listMedia({ tabId }) {
  if (!Number.isInteger(tabId)) return { ok: false, media: [] };
  return { ok: true, media: await getMedia(tabId) };
}
// #full-end

// ---- Âm lượng từng tab --------------------------------------------------------------------------
// 0–100%: chỉnh âm lượng thẻ <video>/<audio> trong tab (src/page/volume.js), dùng được cho mọi tab.
// >100%: bắt âm thanh tab (tabCapture) rồi khuếch đại trong trang offscreen. Chrome chỉ cho bắt âm thanh
//        tab mà người dùng đã mở popup, nên popup lấy streamId rồi gửi sang đây.
const MAX_LEVEL = 6;
const volKey = (tabId) => `vol:${tabId}`;
const isWebUrl = (url) => /^(https?|file):/i.test(url || '');

async function volState(tabId) {
  const key = volKey(tabId);
  return (await chrome.storage.session.get(key))[key] || { level: 1, captured: false };
}

async function saveVol(tabId, st) {
  if (st.level === 1 && !st.captured) await chrome.storage.session.remove(volKey(tabId));
  else await chrome.storage.session.set({ [volKey(tabId)]: st });
}

async function scaleMedia(tabId, factor) {
  try {
    const target = { tabId, allFrames: true };
    await chrome.scripting.executeScript({ target, files: ['src/page/volume.js'] }); // volume.js không có chữ hiển thị
    await chrome.scripting.executeScript({
      target, func: (f) => globalThis.__CT_VOL && globalThis.__CT_VOL.set(f), args: [factor],
    });
    return true;
  } catch (_) {
    return false; // trang hệ thống, Cửa hàng Chrome... không chèn được
  }
}

async function offscreenCall(msg) {
  if (!chrome.offscreen.hasDocument || !(await chrome.offscreen.hasDocument())) return { ok: false };
  return chrome.runtime.sendMessage(msg).catch(() => ({ ok: false }));
}

async function listAudio({ currentTabId }) {
  const [tabs, stored] = await Promise.all([chrome.tabs.query({}), chrome.storage.session.get(null)]);
  const out = [];
  for (const t of tabs) {
    const st = stored[volKey(t.id)] || { level: 1, captured: false };
    const muted = !!(t.mutedInfo && t.mutedInfo.muted);
    const current = t.id === currentTabId && isWebUrl(t.url);
    if (!(t.audible || muted || st.level !== 1 || st.captured || current)) continue;
    out.push({
      id: t.id, windowId: t.windowId, title: t.title || t.url || '', url: t.url || '', favIconUrl: t.favIconUrl || '',
      audible: !!t.audible, muted, level: st.level, captured: !!st.captured, current, lastAccessed: t.lastAccessed || 0,
    });
  }
  out.sort((a, b) => (b.current - a.current) || (b.audible - a.audible) || (b.lastAccessed - a.lastAccessed));
  return { ok: true, tabs: out.slice(0, 30) };
}

async function setVolume({ tabId, level }) {
  if (!Number.isInteger(tabId)) return { ok: false, error: t('bg_vol_no_tab') };
  const st = await volState(tabId);
  st.level = Math.round(Math.max(0, Math.min(MAX_LEVEL, Number(level) || 0)) * 100) / 100;
  if (st.captured) {
    const res = await offscreenCall({ type: 'off:gain', tabId, gain: st.level });
    if (!res || !res.ok) st.captured = false; // trang offscreen đã đóng -> quay về cách thường
  }
  if (!st.captured) {
    st.level = Math.min(1, st.level);
    if (!(await scaleMedia(tabId, st.level))) return { ok: false, error: t('bg_vol_cannot_set') };
  }
  await saveVol(tabId, st);
  return { ok: true, level: st.level, captured: st.captured };
}

async function startBoost({ tabId, streamId, level }) {
  if (!Number.isInteger(tabId) || typeof streamId !== 'string') return { ok: false, error: t('bg_vol_no_tab_info') };
  const gain = Math.max(0, Math.min(MAX_LEVEL, Number(level) || 1));
  await ensureOffscreen();
  const res = await chrome.runtime.sendMessage({ type: 'off:capture', tabId, streamId, gain }).catch((e) => ({ ok: false, error: String(e.message) }));
  if (!res || !res.ok) {
    return { ok: false, error: res && res.error ? offscreenError(res.error, res.args) : t('bg_vol_capture_failed') };
  }
  await scaleMedia(tabId, 1); // từ giờ bộ khuếch đại lo toàn bộ âm lượng
  const st = { level: gain, captured: true };
  await saveVol(tabId, st);
  return { ok: true, ...st };
}

async function resetVolume({ tabId }) {
  const st = await volState(tabId);
  if (st.captured) await offscreenCall({ type: 'off:stop', tabId });
  if (st.level !== 1) await scaleMedia(tabId, 1);
  await chrome.storage.session.remove(volKey(tabId));
  return { ok: true, level: 1, captured: false };
}

async function muteTab({ tabId, muted }) {
  await chrome.tabs.update(tabId, { muted: !!muted });
  const st = await volState(tabId);
  if (st.captured) await offscreenCall({ type: 'off:mute', tabId, muted: !!muted });
  return { ok: true };
}

async function muteOthers({ tabId }) {
  const tabs = await chrome.tabs.query({ audible: true });
  await Promise.all(tabs.filter((t) => t.id !== tabId).map((t) => muteTab({ tabId: t.id, muted: true })));
  return { ok: true, count: tabs.filter((t) => t.id !== tabId).length };
}

async function focusTab({ tabId }) {
  const tab = await chrome.tabs.update(tabId, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
  return { ok: true };
}

let volChangedTimer = 0;
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if ('audible' in info || 'mutedInfo' in info || 'title' in info || 'favIconUrl' in info) {
    clearTimeout(volChangedTimer);
    volChangedTimer = setTimeout(() => broadcastRuntime({ type: 'vol:changed' }), 150);
  }
  if (info.status === 'complete') {
    // Trang mới tải lại trong tab đang giảm âm lượng -> chỉnh lại các thẻ media mới.
    volState(tabId).then((st) => { if (!st.captured && st.level < 1) scaleMedia(tabId, st.level); });
  }
});
chrome.tabs.onRemoved.addListener((tabId) => {
  volState(tabId).then((st) => { if (st.captured) offscreenCall({ type: 'off:stop', tabId }); });
  chrome.storage.session.remove(volKey(tabId));
});

// ---- Chụp màn hình (cả trang / phần đang thấy / chọn vùng) ----------------------------------------
// Cả trang: cuộn từng màn hình, chụp bằng captureVisibleTab (Chrome cho tối đa 2 lần/giây), ẩn thanh tiêu đề
// dính sau khung đầu. Các khung được giữ ở đây; trang kết quả (src/shot/shot.html) lấy về rồi ghép.
const SHOT_GAP = 550;
const MAX_FRAMES = 40;
const shots = new Map(); // id -> { meta, frames: [{ y, dataUrl }] }
let shotBusy = false;
let lastCapture = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shotCall(tabId, name, ...args) {
  const [r] = await chrome.scripting.executeScript({
    target: { tabId }, func: (n, a) => globalThis.__CT_SHOT[n](...a), args: [name, args],
  });
  return r && r.result;
}

async function captureFrame(windowId) {
  for (let attempt = 0; ; attempt += 1) {
    const wait = lastCapture + SHOT_GAP - Date.now();
    if (wait > 0) await sleep(wait);
    lastCapture = Date.now();
    try {
      return await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
    } catch (err) {
      if (attempt < 2 && /quota|MAX_CAPTURE/i.test(String(err && err.message))) continue;
      throw err;
    }
  }
}

function shotBadge(text) {
  chrome.action.setBadgeBackgroundColor({ color: '#3b82f6' });
  chrome.action.setBadgeText({ text });
}

async function runShot(tab, mode) {
  const tabId = tab.id;
  await chrome.scripting.executeScript({ target: { tabId }, files: ['src/shared/i18n.js', 'src/page/shot.js'] });
  let rect = null;
  if (mode === 'region') {
    rect = await shotCall(tabId, 'select');
    if (!rect) return; // người dùng bấm Esc
  }
  shotBadge('…');
  let info = await shotCall(tabId, 'prepare', { hideScrollbar: mode === 'full' });
  const frames = [];
  let truncated = false;
  try {
    if (!info.viewWidth || info.viewHeight < 50) throw new Error('Window is minimized or too small to capture.');
    if (mode === 'full') {
      let y = 0;
      for (;;) {
        const actual = await shotCall(tabId, 'scrollTo', y);
        const current = await chrome.tabs.get(tabId);
        if (!current.active) throw new Error('User switched to another tab during capture.');
        shotBadge(String(frames.length + 1));
        frames.push({ y: actual, dataUrl: await captureFrame(tab.windowId) });
        if (frames.length === 1) await shotCall(tabId, 'hideFixed');
        info = await shotCall(tabId, 'prepare'); // trang có thể dài thêm khi cuộn (ảnh lười tải)
        if (actual + info.viewHeight >= info.height - 1 || actual < y - 1) break; // hết trang
        if (frames.length >= MAX_FRAMES) {
          truncated = true;
          break;
        }
        y = actual + info.viewHeight;
      }
    } else {
      frames.push({ y: info.scrollY, dataUrl: await captureFrame(tab.windowId) });
    }
  } finally {
    await shotCall(tabId, 'restore').catch(() => {});
    updateBadge();
  }
  const id = Math.random().toString(36).slice(2, 10);
  shots.set(id, { meta: { ...info, mode, rect, truncated, count: frames.length, time: Date.now() }, frames });
  while (shots.size > 3) shots.delete(shots.keys().next().value);
  await chrome.tabs.create({ url: chrome.runtime.getURL(`src/shot/shot.html#${id}`), index: tab.index + 1, openerTabId: tabId });
}

async function startShot({ tabId, mode }) {
  if (!['full', 'visible', 'region'].includes(mode)) return { ok: false, error: t('bg_shot_bad_mode') };
  if (shotBusy) return { ok: false, error: t('bg_shot_busy') };
  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch (_) {
    return { ok: false, error: t('bg_shot_no_tab') };
  }
  if (!isWebUrl(tab.url)) return { ok: false, error: t('bg_shot_restricted') };
  shotBusy = true;
  runShot(tab, mode)
    .catch((err) => {
      console.warn('[Cinema Tools] screenshot failed', err);
      shotBadge('!');
      setTimeout(updateBadge, 3000);
    })
    .finally(() => { shotBusy = false; });
  return { ok: true };
}

function shotMeta({ id }) {
  const s = shots.get(id);
  return s ? { ok: true, meta: s.meta } : { ok: false };
}

function shotFrame({ id, index }) {
  const s = shots.get(id);
  const f = s && s.frames[index];
  return f ? { ok: true, ...f } : { ok: false };
}

// ---- Phím tắt toàn cục: cửa sổ nổi (Alt+P), chụp cả trang (Alt+S) --------------------------------
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'capture-page' && tab && isWebUrl(tab.url)) {
    startShot({ tabId: tab.id, mode: 'full' });
    return;
  }
  if (command !== 'toggle-pip' || !tab || !isWebUrl(tab.url)) return;
  // Gọi ngay (không await gì trước) để trình duyệt còn coi là thao tác của người dùng.
  globalThis.YTX_SHARED.pipInTab(tab.id).then((res) => {
    if (res && res.ok) return;
    // Không mở được (trang không có video...): báo nhanh bằng dấu "!" trên biểu tượng.
    chrome.action.setBadgeBackgroundColor({ color: '#ff6a4d' });
    chrome.action.setBadgeText({ text: '!' });
    setTimeout(updateBadge, 2500);
  });
});

// ---- Nhận lệnh -------------------------------------------------------------------------------
const HANDLERS = {
  // #full-start
  'dl:ping': () => nativeCall({ cmd: 'ping' }),
  'dl:info': (m) => getInfo(m),
  'dl:start': (m, sender) => startJob(m, sender),
  'dl:cancel': (m) => cancelJob(m),
  'dl:jobs': () => listJobs(),
  'dl:clear': () => clearJobs(),
  'dl:reveal': (m) => nativeCall({ cmd: 'reveal', path: m.path }),
  'dl:open': (m) => nativeCall({ cmd: 'open', path: m.path }),
  'file:download': (m) => downloadFile(m),
  'media:list': (m) => listMedia(m),
  // #full-end
  'img:download': (m) => downloadImages(m),
  'vol:list': (m) => listAudio(m),
  'vol:set': (m) => setVolume(m),
  'vol:boost': (m) => startBoost(m),
  'vol:reset': (m) => resetVolume(m),
  'vol:mute': (m) => muteTab(m),
  'vol:muteOthers': (m) => muteOthers(m),
  'vol:focus': (m) => focusTab(m),
  'shot:start': (m) => startShot(m),
  'shot:meta': (m) => shotMeta(m),
  'shot:frame': (m) => shotFrame(m),
  'shot:done': ({ id }) => ({ ok: shots.delete(id) }),
};

// Content script (chạy trong trang web) chỉ được gọi vài lệnh; còn lại chỉ dành cho trang của extension
// (popup, trang kết quả chụp màn hình).
const CONTENT_SCRIPT_TYPES = new Set([
  // #full-start
  'dl:ping', 'dl:start', 'dl:cancel', 'dl:open', 'dl:reveal', 'img:download',
  // #full-end
]);
const EXTENSION_ORIGIN = chrome.runtime.getURL('');

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string' || sender.id !== chrome.runtime.id) return undefined;
  const fromExtensionPage = !sender.tab || (sender.url || '').startsWith(EXTENSION_ORIGIN);
  if (!fromExtensionPage && !CONTENT_SCRIPT_TYPES.has(msg.type)) return undefined;
  const handler = HANDLERS[msg.type];
  if (!handler) return undefined;
  Promise.resolve()
    .then(() => handler(msg, sender))
    .then(sendResponse, (err) => sendResponse({ ok: false, error: String((err && err.message) || err) }));
  return true;
});

// #full-start
restoreJobs().then(updateBadge);
// #full-end
