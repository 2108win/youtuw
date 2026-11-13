/*
 * Trang ẩn (offscreen) phục vụ service worker:
 * tải ảnh, kiểm tra bản "lớn hơn" có thật không, đổi định dạng PNG/JPG/WebP,
 * rồi tạo blob URL để chrome.downloads lưu về máy (service worker không tạo được blob URL).
 * Trang này không có chrome.i18n: lỗi trả về là mã khoá (bg_…, kèm err.args cho $1…),
 * service worker dịch (offscreenError trong background.js).
 */
'use strict';

const MIME_EXT = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/pjpeg': 'jpg', 'image/png': 'png', 'image/apng': 'png',
  'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif', 'image/svg+xml': 'svg', 'image/bmp': 'bmp',
  'image/x-icon': 'ico', 'image/vnd.microsoft.icon': 'ico', 'image/tiff': 'tif', 'image/jxl': 'jxl',
};
const OUT_MIME = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };
const OUT_EXT = { png: 'png', jpeg: 'jpg', webp: 'webp' };
const REVOKE_AFTER = 3 * 60 * 1000;
const MAX_BYTES = 50 * 1024 * 1024; // ảnh lớn hơn 50 MB: bỏ qua
const IMAGE_EXTS = new Set(['jpg', 'jfif', 'png', 'gif', 'webp', 'avif', 'bmp', 'svg', 'tif', 'tiff', 'ico', 'heic', 'jxl']);

/** Địa chỉ trong mạng nội bộ / máy này: không tự gửi yêu cầu tới (src/shared/net.js). */
const { isPrivateHost } = globalThis.YTX_NET;

function extFromUrl(url) {
  try {
    const m = new URL(url).pathname.match(/\.([a-z0-9]{2,5})$/i);
    return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : '';
  } catch (_) {
    return '';
  }
}

/** Nhận diện ảnh qua vài byte đầu khi máy chủ không gửi đúng loại tệp. */
async function sniff(blob) {
  const b = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  if (hex.startsWith('ffd8ff')) return 'image/jpeg';
  if (hex.startsWith('89504e47')) return 'image/png';
  if (hex.startsWith('47494638')) return 'image/gif';
  if (hex.startsWith('52494646') && hex.slice(16, 24) === '57454250') return 'image/webp';
  if (hex.slice(8, 24) === '6674797061766966') return 'image/avif';
  if (hex.startsWith('424d')) return 'image/bmp';
  const head = new TextDecoder().decode(b).trimStart();
  if (head.startsWith('<svg') || head.startsWith('<?xml')) return 'image/svg+xml';
  return '';
}

async function fetchImage(url) {
  if (/^https?:/i.test(url) && isPrivateHost(url)) throw new Error('bg_img_private_host');
  // Lần đầu không gửi cookie; chỉ thử lại kèm phiên đăng nhập khi máy chủ đòi (401/403).
  let res = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (res.status === 401 || res.status === 403) res = await fetch(url, { credentials: 'include', referrerPolicy: 'no-referrer' });
  if (!res.ok) throw Object.assign(new Error('bg_img_server_status'), { args: [res.status] });
  if (+(res.headers.get('content-length') || 0) > MAX_BYTES) throw new Error('bg_img_too_large');
  let blob = await res.blob();
  if (blob.size > MAX_BYTES) throw new Error('bg_img_too_large');
  let type = (blob.type || '').toLowerCase();
  if (!type.startsWith('image/')) {
    type = await sniff(blob);
    if (!type) throw new Error('bg_img_not_image');
    blob = new Blob([blob], { type });
  }
  return blob;
}

async function decode(blob) {
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } finally {
    URL.revokeObjectURL(url);
  }
  let w = img.naturalWidth;
  let h = img.naturalHeight;
  if (blob.type === 'image/svg+xml') {
    // Ảnh vector: vẽ ra ít nhất 1024 px ở cạnh dài.
    if (!w || !h) { w = 1024; h = 1024; }
    const scale = Math.min(32, Math.max(1, 1024 / Math.max(w, h)));
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }
  return { img, w, h };
}

async function convert(img, w, h, format, quality) {
  if (!w || !h || w * h > 16384 * 16384) throw new Error('bg_img_bad_size');
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  if (format === 'jpeg') {
    ctx.fillStyle = '#ffffff'; // JPG không có nền trong suốt
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.convertToBlob({ type: OUT_MIME[format], quality });
}

function publish(blob) {
  const url = URL.createObjectURL(blob);
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER);
  return url;
}

async function processImage({ candidates, format, quality, minW, minH }) {
  let lastError = null;
  for (let i = 0; i < candidates.length; i += 1) {
    const url = candidates[i];
    const isGuess = i < candidates.length - 1; // các địa chỉ "bản lớn hơn" là đoán, cần kiểm tra
    try {
      const blob = await fetchImage(url);
      let dims = null;
      try {
        dims = await decode(blob);
      } catch (err) {
        if (format !== 'original' || isGuess) throw new Error('bg_img_unreadable');
      }
      if (isGuess && dims && (dims.w < minW || dims.h < minH)) continue; // bản đoán lại nhỏ hơn -> bỏ
      if (format === 'original' || !OUT_MIME[format]) {
        return {
          ok: true, url, blobUrl: publish(blob), width: dims && dims.w, height: dims && dims.h,
          ext: MIME_EXT[blob.type] || (IMAGE_EXTS.has(extFromUrl(url)) ? extFromUrl(url) : 'jpg'),
        };
      }
      const out = await convert(dims.img, dims.w, dims.h, format, quality);
      return { ok: true, url, blobUrl: publish(out), width: dims.w, height: dims.h, ext: OUT_EXT[format] };
    } catch (err) {
      lastError = err;
    }
  }
  return {
    ok: false,
    error: String((lastError && lastError.message) || 'bg_img_failed'),
    args: (lastError && Array.isArray(lastError.args)) ? lastError.args : [],
  };
}

// ---- Tăng âm lượng tab: bắt âm thanh tab -> khuếch đại -> phát ra loa ----------------------------
const captures = new Map(); // tabId -> { stream, ctx, gain, level, muted }

function stopCapture(tabId) {
  const c = captures.get(tabId);
  if (!c) return;
  captures.delete(tabId);
  for (const t of c.stream.getTracks()) t.stop();
  c.ctx.close().catch(() => {});
}

function applyGain(c) {
  c.gain.gain.setTargetAtTime(c.muted ? 0 : c.level, c.ctx.currentTime, 0.03);
}

async function startCapture({ tabId, streamId, gain }) {
  stopCapture(tabId);
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } },
    video: false,
  });
  const ctx = new AudioContext({ latencyHint: 'playback' });
  const source = ctx.createMediaStreamSource(stream);
  const amp = ctx.createGain();
  // Chặn đỉnh để khi tăng to (tới 600%) âm thanh không bị vỡ.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -2;
  limiter.knee.value = 2;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.2;
  source.connect(amp).connect(limiter).connect(ctx.destination);
  const c = { stream, ctx, gain: amp, level: gain, muted: false };
  amp.gain.value = gain;
  captures.set(tabId, c);
  for (const t of stream.getAudioTracks()) t.addEventListener('ended', () => stopCapture(tabId));
  if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
  return { ok: true };
}

const VOLUME_HANDLERS = {
  'off:capture': (m) => startCapture(m),
  'off:gain': ({ tabId, gain }) => {
    const c = captures.get(tabId);
    if (!c) return { ok: false };
    c.level = gain;
    applyGain(c);
    return { ok: true };
  },
  'off:mute': ({ tabId, muted }) => {
    const c = captures.get(tabId);
    if (!c) return { ok: false };
    c.muted = muted;
    applyGain(c);
    return { ok: true };
  },
  'off:stop': ({ tabId }) => {
    stopCapture(tabId);
    return { ok: true };
  },
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Chỉ nhận lệnh từ service worker của chính extension (không từ trang web / content script).
  if (!msg || typeof msg.type !== 'string' || sender.id !== chrome.runtime.id || sender.tab) return undefined;
  if (VOLUME_HANDLERS[msg.type]) {
    Promise.resolve()
      .then(() => VOLUME_HANDLERS[msg.type](msg))
      .then(sendResponse, (err) => sendResponse({ ok: false, error: String((err && err.message) || err) }));
    return true;
  }
  if (msg.type === 'off:image') {
    processImage(msg).then(sendResponse, (err) => sendResponse({ ok: false, error: String(err && err.message) }));
    return true;
  }
  if (msg.type === 'off:revoke' && typeof msg.url === 'string' && msg.url.startsWith('blob:')) {
    URL.revokeObjectURL(msg.url);
  }
  return undefined;
});
