/*
 * Xem trước khi chia sẻ – thu thập dữ liệu.
 *
 * Đọc thẻ <head> ở hai nơi:
 *   - HTML gốc: tải lại địa chỉ trang KHÔNG kèm cookie, giống máy quét của Facebook, Zalo, X… (chúng không chạy JavaScript);
 *   - trang đang hiển thị trong tab (sau khi JavaScript chạy), để biết thẻ nào chỉ có nhờ JavaScript.
 * Rồi tải ảnh chia sẻ để đo kích thước, dung lượng, định dạng.
 * Mọi yêu cầu: chỉ http(s), không cookie, không gửi referrer, có giới hạn thời gian và dung lượng.
 */
(() => {
  'use strict';

  const PAGE_MAX = 5 * 1024 * 1024;    // HTML gốc: đọc tối đa 5 MB
  const IMAGE_MAX = 20 * 1024 * 1024;  // ảnh: dừng đọc khi quá 20 MB (Facebook chỉ nhận tới 8 MB)
  const ICON_MAX = 1024 * 1024;
  const TIMEOUT = 20000;

  /**
   * Đọc thẻ meta / link / title của một tài liệu. Hàm phải tự đủ (không dùng biến bên ngoài) vì còn được
   * chrome.scripting chép sang chạy trong tab. Không tham số = tài liệu của tab.
   */
  function extractHead(doc) {
    const inTab = !doc;
    doc = doc || document;
    const cut = (s, n) => String(s == null ? '' : s).trim().slice(0, n);
    const metas = [];
    for (const m of doc.querySelectorAll('meta')) {
      if (metas.length >= 400) break;
      if (m.hasAttribute('charset')) metas.push({ key: 'charset', value: cut(m.getAttribute('charset'), 40) });
      const prop = m.getAttribute('property');
      const name = m.getAttribute('name');
      const equiv = m.getAttribute('http-equiv');
      const key = cut(prop || name || (equiv ? `http-equiv:${equiv}` : ''), 120).toLowerCase();
      if (!key) continue;
      metas.push({ key, value: cut(m.getAttribute('content'), 2000), attr: prop ? 'property' : equiv ? 'http-equiv' : 'name' });
    }
    const links = [];
    for (const l of doc.querySelectorAll('link[rel][href]')) {
      if (links.length >= 150) break;
      links.push({
        rel: cut(l.getAttribute('rel'), 120).toLowerCase(),
        href: cut(l.getAttribute('href'), 2000),
        sizes: cut(l.getAttribute('sizes'), 40),
        type: cut(l.getAttribute('type'), 60),
      });
    }
    const jsonLd = [];
    for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
      if (jsonLd.length >= 30) break;
      try {
        const data = JSON.parse(s.textContent);
        const walk = (node, depth) => {
          if (!node || typeof node !== 'object' || depth > 4) return;
          if (Array.isArray(node)) { node.forEach((n) => walk(n, depth + 1)); return; }
          const t = node['@type'];
          if (t) [].concat(t).forEach((x) => jsonLd.push(cut(x, 60)));
          if (node['@graph']) walk(node['@graph'], depth + 1);
        };
        walk(data, 0);
      } catch (_) {
        // Hàm còn chạy trong tab (không có YTX_I18N) nên gọi thẳng chrome.i18n (có ở cả trang extension lẫn tab).
        let bad = '';
        try { bad = chrome.i18n.getMessage('share_jsonld_invalid'); } catch (_e) { /* không có chrome.i18n */ }
        jsonLd.push(bad || '(invalid JSON)');
      }
    }
    const h1s = [...doc.querySelectorAll('h1')];
    const base = doc.querySelector('base[href]');
    return {
      title: cut(doc.title, 500),
      lang: cut(doc.documentElement && doc.documentElement.getAttribute('lang'), 40),
      base: base ? cut(base.getAttribute('href'), 2000) : '',
      metas,
      links,
      jsonLd: jsonLd.slice(0, 30),
      h1Count: h1s.length,
      h1: h1s.length ? cut(h1s[0].textContent.replace(/\s+/g, ' '), 200) : '',
      url: inTab ? location.href : '',
    };
  }

  const { isPrivateHost } = globalThis.YTX_NET; // src/shared/net.js
  const L = globalThis.YTX_I18N; // src/shared/i18n.js (không đặt tên t: extractHead có biến t riêng)

  /**
   * Tải một địa chỉ (không cookie), đọc tối đa `max` byte. Không bao giờ ném lỗi: lỗi nằm trong `error`.
   * `partial`: quá `max` thì giữ phần đầu (HTML); không thì bỏ luôn (ảnh).
   * `blockPrivate`: bị chuyển hướng tới địa chỉ mạng nội bộ thì dừng, không đọc nội dung (yêu cầu tới đó có thể
   * đã gửi đi: fetch không cho xét từng bước chuyển hướng).
   * `signal`: huỷ khi người dùng kiểm tra trang khác.
   */
  async function fetchLimited(url, { max, timeout = TIMEOUT, accept, partial = false, blockPrivate = false, signal } = {}) {
    if (!/^https?:\/\//i.test(url)) return { ok: false, status: 0, error: L.t('share_err_http_only') };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    if (signal) {
      if (signal.aborted) ctrl.abort();
      else signal.addEventListener('abort', () => ctrl.abort(), { once: true });
    }
    try {
      const res = await fetch(url, {
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'follow',
        referrerPolicy: 'no-referrer',
        signal: ctrl.signal,
        headers: accept ? { Accept: accept } : undefined,
      });
      if (blockPrivate && res.url && isPrivateHost(res.url)) {
        ctrl.abort();
        return { ok: false, status: 0, blocked: true, error: L.t('share_err_redirect_private') };
      }
      const declared = +(res.headers.get('content-length') || 0);
      const out = {
        ok: res.ok, status: res.status, url: res.url || url, redirected: res.redirected,
        contentType: (res.headers.get('content-type') || '').toLowerCase(),
        xRobots: res.headers.get('x-robots-tag') || '',
        bytes: new Uint8Array(0), size: declared, truncated: false,
      };
      if (declared > max && !partial) {
        ctrl.abort();
        out.truncated = true;
        return out;
      }
      const chunks = [];
      let size = 0;
      const reader = res.body && res.body.getReader();
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > max) {
          out.truncated = true;
          reader.cancel().catch(() => {});
          break;
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
      let off = 0;
      for (const c of chunks) { bytes.set(c, off); off += c.byteLength; }
      out.bytes = bytes;
      out.size = out.truncated ? Math.max(declared, size) : bytes.byteLength;
      return out;
    } catch (err) {
      const aborted = err && err.name === 'AbortError';
      return { ok: false, status: 0, error: aborted ? L.t('share_err_timeout', L.num(timeout / 1000)) : L.t('share_err_connect') };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Giải mã HTML theo bảng mã của máy chủ / thẻ meta charset (fetch().text() luôn coi là UTF-8). */
  function decodeHtml(bytes, contentType) {
    let label = (/charset=["']?\s*([\w:.-]+)/i.exec(contentType || '') || [])[1];
    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) label = 'utf-8';
    else if (bytes[0] === 0xfe && bytes[1] === 0xff) label = 'utf-16be';
    else if (bytes[0] === 0xff && bytes[1] === 0xfe) label = 'utf-16le';
    if (!label) {
      const head = new TextDecoder('windows-1252').decode(bytes.subarray(0, 4096));
      label = (/<meta[^>]+charset\s*=\s*["']?\s*([\w:.-]+)/i.exec(head) || [])[1];
    }
    try {
      return { text: new TextDecoder(label || 'utf-8').decode(bytes), charset: (label || 'utf-8').toLowerCase() };
    } catch (_) {
      return { text: new TextDecoder('utf-8').decode(bytes), charset: 'utf-8' };
    }
  }

  /** HTML gốc của trang: thứ máy quét mạng xã hội nhận được. */
  async function fetchPage(url, { signal } = {}) {
    const r = await fetchLimited(url, { max: PAGE_MAX, partial: true, signal, accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8' });
    if (!r.status) return r;
    const result = {
      ok: r.ok, status: r.status, url: r.url, redirected: r.redirected, contentType: r.contentType,
      xRobots: r.xRobots, size: r.size, truncated: r.truncated,
    };
    if (!r.bytes.byteLength) return { ...result, head: null };
    const { text, charset } = decodeHtml(r.bytes, r.contentType);
    // DOMParser không chạy script, không tải ảnh: chỉ dùng để đọc chữ và thuộc tính.
    const doc = new DOMParser().parseFromString(text, 'text/html');
    return { ...result, charset, isHtml: /html|xml/.test(r.contentType) || /<html|<head|<meta/i.test(text.slice(0, 2000)), head: extractHead(doc) };
  }

  /** Nhận diện định dạng ảnh qua vài byte đầu. */
  function sniffImage(bytes) {
    const hex = [...bytes.subarray(0, 16)].map((x) => x.toString(16).padStart(2, '0')).join('');
    if (hex.startsWith('ffd8ff')) return 'image/jpeg';
    if (hex.startsWith('89504e47')) return 'image/png';
    if (hex.startsWith('47494638')) return 'image/gif';
    if (hex.startsWith('52494646') && hex.slice(16, 24) === '57454250') return 'image/webp';
    if (hex.slice(8, 24) === '6674797061766966' || hex.slice(8, 24) === '6674797061766973') return 'image/avif';
    if (hex.slice(8, 16) === '66747970' && /^(68656963|68656978|6d696631)/.test(hex.slice(16, 24))) return 'image/heic';
    if (hex.startsWith('424d')) return 'image/bmp';
    if (hex.startsWith('00000100')) return 'image/x-icon';
    const start = new TextDecoder('utf-8').decode(bytes.subarray(0, 512)).trimStart().toLowerCase();
    if (start.startsWith('<svg') || (start.startsWith('<?xml') && start.includes('<svg'))) return 'image/svg+xml';
    if (start.startsWith('<!doctype html') || start.startsWith('<html')) return 'text/html';
    return '';
  }

  // Chỉ những định dạng ảnh điểm (raster) này mới được tạo blob URL để hiển thị. Không bao giờ tạo blob SVG / HTML
  // (tài liệu do trang khác viết, mở ra sẽ mang origin của extension).
  const RASTER = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif', 'image/bmp', 'image/x-icon']);
  const MAX_PIXELS = 50e6; // ảnh lớn hơn ~50 triệu điểm ảnh: không hiển thị (tránh ngốn bộ nhớ)

  /**
   * Tải ảnh, đo kích thước. `allowPrivate`: trang đang kiểm tra cũng nằm ở mạng nội bộ (đang phát triển trên máy)
   * thì mới tải ảnh ở địa chỉ nội bộ; trang công khai mà khai báo ảnh nội bộ thì không gửi yêu cầu.
   * Kết quả: ok = tải được và đúng là ảnh; type = định dạng nhận ra từ nội dung (không tin content-type của máy chủ);
   * objectUrl chỉ có với ảnh raster giải mã được.
   */
  async function loadImage(url, { allowPrivate = false, max = IMAGE_MAX, signal } = {}) {
    const info = { url };
    if (!/^https?:\/\//i.test(url)) return { ...info, error: L.t('share_err_not_http') };
    if (!allowPrivate && isPrivateHost(url)) {
      return { ...info, blocked: true, error: L.t('share_err_image_private') };
    }
    const r = await fetchLimited(url, { max, signal, blockPrivate: !allowPrivate });
    if (!r.status) return { ...info, blocked: r.blocked, error: r.error };
    Object.assign(info, { status: r.status, finalUrl: r.url, redirected: r.redirected, size: r.size, contentType: r.contentType.split(';')[0].trim() });
    if (!r.ok) return { ...info, error: L.t('share_err_http_status', r.status) };
    if (r.truncated) return { ...info, ok: true, tooLarge: true };
    info.type = sniffImage(r.bytes);
    info.ok = /^image\//.test(info.type);
    if (!RASTER.has(info.type)) return info;
    const blob = new Blob([r.bytes], { type: info.type });
    try {
      const bmp = await createImageBitmap(blob);
      info.width = bmp.width;
      info.height = bmp.height;
      bmp.close();
    } catch (_) {
      info.decodeError = true;
    }
    if (!info.decodeError && info.width * info.height <= MAX_PIXELS) info.objectUrl = URL.createObjectURL(blob);
    return info;
  }

  globalThis.SHARE_COLLECT = Object.freeze({
    extractHead, isPrivateHost, fetchPage, loadImage, ICON_MAX,
  });
})();
