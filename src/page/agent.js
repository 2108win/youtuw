/*
 * Chạy trong trang web (popup chèn vào khi cần; trên YouTube có sẵn qua manifest):
 *  - scan():     liệt kê ảnh trên trang; đoán địa chỉ ảnh lớn nhất.
 *  - snapshot(): chụp khung hình video đang phát ở độ phân giải gốc và lưu về máy.
 * Không phụ thuộc file khác; tạo phần tử bằng DOM API (không innerHTML).
 */
// #full-start
// Bản đầy đủ: scan() còn liệt kê tệp video, video nhúng, bài viết có video (cho bộ tải yt-dlp).
// #full-end
(() => {
  'use strict';
  const VERSION = 2; // tăng khi sửa: popup chèn bản mới đè bản cũ còn trong trang
  if (globalThis.__CT_AGENT && globalThis.__CT_AGENT.version >= VERSION) return;

  const IMG_EXT = /\.(jpe?g|jfif|png|gif|webp|avif|bmp|svg|tiff?|heic)$/i;
  // #full-start
  const VID_EXT = /\.(mp4|webm|mov|m4v|mkv|ogv|flv|avi|3gp|m3u8|mpd|mp3|m4a|ogg|oga|wav|flac)$/i;
  const AUDIO_EXT = /\.(mp3|m4a|ogg|oga|wav|flac)$/i;
  // #full-end
  const MAX_ELEMENTS = 25000;
  const MAX_BG = 6000;
  const MAX_IMAGES = 800;

  const abs = (u) => {
    if (typeof u !== 'string' || !u.trim()) return null; // chuỗi rỗng sẽ thành địa chỉ trang
    try {
      return new URL(u.trim(), document.baseURI).href;
    } catch (_) {
      return null;
    }
  };
  const isHttp = (u) => /^https?:\/\//i.test(u || '');
  const pathOf = (u) => {
    try {
      return new URL(u).pathname;
    } catch (_) {
      return '';
    }
  };

  // ---- srcset ----------------------------------------------------------------------
  function parseSrcset(s) {
    const out = [];
    if (!s) return out;
    const n = s.length;
    let i = 0;
    while (i < n) {
      while (i < n && /[\s,]/.test(s[i])) i += 1;
      if (i >= n) break;
      let j = i;
      while (j < n && !/\s/.test(s[j])) j += 1;
      let url = s.slice(i, j);
      let desc = '';
      if (url.endsWith(',')) {
        url = url.replace(/,+$/, '');
        i = j;
      } else {
        let k = j;
        while (k < n && s[k] !== ',') k += 1;
        desc = s.slice(j, k);
        i = k + 1;
      }
      const w = desc.match(/(\d+(?:\.\d+)?)w/);
      const x = desc.match(/(\d+(?:\.\d+)?)x/);
      out.push({ url, w: w ? +w[1] : 0, x: x ? +x[1] : 1 });
    }
    return out;
  }

  function bestFromSrcset(srcset) {
    const list = parseSrcset(srcset);
    if (!list.length) return null;
    list.sort((a, b) => (b.w - a.w) || (b.x - a.x));
    return abs(list[0].url);
  }

  // ---- Đoán bản ảnh lớn nhất (sai thì tự quay về địa chỉ gốc khi tải) ----------------------
  const RESIZE_PARAMS = ['w', 'h', 'width', 'height', 'resize', 'fit', 'crop', 'size', 'dpr', 'quality', 'q'];

  function upgrades(url) {
    let u;
    try {
      u = new URL(url);
    } catch (_) {
      return [];
    }
    const host = u.hostname;
    const path = u.pathname;
    const out = [];
    let m;

    // #full-start
    // Ảnh bìa YouTube: maxres (1280×720) -> sd -> hq
    if (/(^|\.)ytimg\.com$/.test(host) && (m = path.match(/^\/(?:vi|vi_webp)\/([\w-]{11})\//))) {
      if (/\/oar\w*\.\w+$/.test(path)) return []; // ảnh bìa Shorts (dọc) giữ nguyên
      // Chỉ đoán các bản lớn hơn bản đang có: maxres (1280×720) > hq720 ≈ maxres > sd (640×480) > hq (480×360)
      const file = path.split('/').pop().replace(/\.\w+$/, '');
      const better = file === 'maxresdefault' ? []
        : file === 'hq720' || file === 'sddefault' ? ['maxresdefault']
          : ['maxresdefault', 'sddefault', 'hqdefault'];
      return better.map((n) => `https://i.ytimg.com/vi/${m[1]}/${n}.jpg`).filter((x) => x !== url);
    }
    // #full-end
    // Ảnh Google (ảnh đại diện, banner YouTube, Blogger, Google Photos): "=s88-c-k..." -> "=s0" (bản gốc)
    if (/(^|\.)(ggpht\.com|googleusercontent\.com)$/.test(host)) {
      const eq = path.indexOf('=', path.lastIndexOf('/'));
      if (eq > 0) out.push(`${u.origin}${path.slice(0, eq)}=s0`);
      else if (/\/[swh]\d+(?:-[\w-]+)?\/[^/]+$/.test(path)) {
        out.push(`${u.origin}${path.replace(/\/[swh]\d+(?:-[\w-]+)?\/([^/]+)$/, '/s0/$1')}`);
      }
    }
    // Twitter / X
    if (host === 'pbs.twimg.com') {
      if (u.searchParams.has('name') && u.searchParams.get('name') !== 'orig') {
        const v = new URL(url);
        v.searchParams.set('name', 'orig');
        out.push(v.href);
      } else if (/:(small|medium|large|thumb)$/.test(path)) {
        out.push(`${u.origin}${path.replace(/:(small|medium|large|thumb)$/, ':orig')}`);
      }
    }
    // Pinterest
    if (host === 'i.pinimg.com' && (m = path.match(/^\/(\d+x\d*)\/(.+)$/)) && m[1] !== 'originals') {
      out.push(`${u.origin}/originals/${m[2]}`, `${u.origin}/736x/${m[2]}`);
    }
    // Wikipedia / Wikimedia: bỏ "/thumb/.../220px-Tên"
    if (host === 'upload.wikimedia.org' && (m = path.match(/^(.*)\/thumb\/(.+)\/[^/]+$/))) {
      out.push(`${u.origin}${m[1]}/${m[2]}`);
    }
    // Reddit
    if (host === 'preview.redd.it') out.push(`https://i.redd.it${path}`);
    // WordPress: ten-anh-300x200.jpg -> ten-anh.jpg
    if ((m = path.match(/^(.*)-\d{2,4}x\d{2,4}(\.(?:jpe?g|png|webp|gif))$/i))) {
      out.push(`${u.origin}${m[1]}${m[2]}${u.search}`);
    }
    // Shopify: ten_200x200.jpg, ten_small.jpg
    if ((/cdn\.shopify\.com$/.test(host) || path.includes('/cdn/shop/')) &&
        (m = path.match(/^(.*?)_(?:\d+x\d*|x\d+|pico|icon|thumb|small|compact|medium|large|grande)(?:_crop_\w+)?(?:@\dx)?(\.\w+)$/i))) {
      out.push(`${u.origin}${m[1]}${m[2]}`);
    }
    // CDN thay đổi kích thước bằng tham số (?w=300&h=200, ?resize=...)
    if (RESIZE_PARAMS.some((p) => u.searchParams.has(p)) && host !== 'pbs.twimg.com') {
      const v = new URL(out.length ? out[out.length - 1] : url);
      for (const p of RESIZE_PARAMS) v.searchParams.delete(p);
      if (v.href !== url) out.push(v.href);
    }
    return out.filter((x) => x !== url);
  }

  function guessName(url, alt) {
    let m;
    if ((m = url.match(/ytimg\.com\/(?:vi|vi_webp)\/([\w-]{11})\//))) return alt || `youtube-${m[1]}`;
    if (url.startsWith('data:')) return alt || 'anh';
    let base = '';
    try {
      base = decodeURIComponent(pathOf(url).split('/').filter(Boolean).pop() || '');
    } catch (_) {
      base = pathOf(url).split('/').pop() || '';
    }
    base = base.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[=:].*$/, '');
    const random = /^[\w-]{24,}$/.test(base) || /^[0-9a-f_-]{16,}$/i.test(base); // mã ngẫu nhiên của CDN
    const meaningless = !base || base.length < 3 || random || /^(image|img|photo|picture|default|maxresdefault|hqdefault)$/i.test(base);
    if (meaningless && alt) return alt.slice(0, 80);
    if (random) return `anh-${base.slice(0, 10)}`;
    return base.slice(0, 100) || 'anh';
  }

  // #full-start
  // ---- Video nhúng (iframe) ----------------------------------------------------------------
  const EMBEDS = [
    [/^https?:\/\/(?:www\.)?youtube(?:-nocookie)?\.com\/embed\/([\w-]{11})/, (m) => `https://www.youtube.com/watch?v=${m[1]}`, 'YouTube'],
    [/^https?:\/\/player\.vimeo\.com\/video\/(\d+)/, (m, u) => u, 'Vimeo'],
    [/^https?:\/\/(?:www\.)?dailymotion\.com\/embed\/video\/([a-z0-9]+)/i, (m) => `https://www.dailymotion.com/video/${m[1]}`, 'Dailymotion'],
    [/^https?:\/\/geo\.dailymotion\.com\/player[^?]*\?(?:.*&)?video=([a-z0-9]+)/i, (m) => `https://www.dailymotion.com/video/${m[1]}`, 'Dailymotion'],
    [/^https?:\/\/(?:www\.)?facebook\.com\/plugins\/video\.php/, (m, u) => new URL(u).searchParams.get('href'), 'Facebook'],
    [/^https?:\/\/(?:www\.)?tiktok\.com\/embed(?:\/v2)?\/(\d+)/, (m) => `https://www.tiktok.com/embed/${m[1]}`, 'TikTok'],
    [/^https?:\/\/streamable\.com\/[eo]\/(\w+)/, (m) => `https://streamable.com/${m[1]}`, 'Streamable'],
    [/^https?:\/\/player\.twitch\.tv\/\?(?:.*&)?video=v?(\d+)/, (m) => `https://www.twitch.tv/videos/${m[1]}`, 'Twitch'],
    [/^https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel)\/([\w-]+)\/embed/, (m) => `https://www.instagram.com/p/${m[1]}/`, 'Instagram'],
  ];

  function matchEmbed(src) {
    for (const [re, toUrl, site] of EMBEDS) {
      const m = src.match(re);
      if (m) {
        const url = toUrl(m, src);
        if (isHttp(url)) return { url, site };
      }
    }
    return null;
  }

  // ---- Bài viết chứa video (bảng tin Facebook, Instagram, TikTok, X...) ---------------------------
  // Địa chỉ trang bảng tin không phải địa chỉ video: tìm liên kết tới bài viết / reel ở gần thẻ <video>.
  const POSTS = [
    [/(^|\.)facebook\.com$/, /^\/(?:reel\/\d+|watch\/?\?(?:.*&)?v=\d+|[^/]+\/videos\/(?:[^/]+\/)?\d+|videos\/\d+|[^/]+\/posts\/(?:pfbid\w+|\d+)|(?:permalink|story)\.php\?(?:.*&)?story_fbid=|groups\/[^/]+\/(?:permalink|posts)\/\d+|share\/[vr]\/\w+)/, 'Facebook'],
    [/(^|\.)fb\.watch$/, /^\/\w+/, 'Facebook'],
    [/(^|\.)instagram\.com$/, /^\/(?:[^/]+\/)?(?:p|reels?|tv)\/[\w-]+/, 'Instagram'],
    [/(^|\.)tiktok\.com$/, /^\/@[\w.-]+\/video\/\d+/, 'TikTok'],
    [/(^|\.)(twitter|x)\.com$/, /^\/[^/]+\/status\/\d+/, 'X'],
    [/(^|\.)youtube\.com$/, /^\/(?:shorts\/[\w-]{11}|watch\?(?:.*&)?v=[\w-]{11})/, 'YouTube'],
    [/(^|\.)vimeo\.com$/, /^\/\d+/, 'Vimeo'],
    [/(^|\.)dailymotion\.com$/, /^\/video\/\w+/, 'Dailymotion'],
    [/(^|\.)reddit\.com$/, /^\/r\/[^/]+\/comments\/\w+/, 'Reddit'],
  ];
  const KEEP_PARAMS = new Set(['v', 'story_fbid', 'id', 'fbid', 'video_id']);

  /** Địa chỉ bài viết có video (đã bỏ tham số theo dõi) hoặc null. */
  function postUrl(href) {
    let u;
    try {
      u = new URL(href, document.baseURI);
    } catch (_) {
      return null;
    }
    if (!/^https?:$/.test(u.protocol)) return null;
    for (const [hostRe, pathRe, site] of POSTS) {
      if (!hostRe.test(u.hostname) || !pathRe.test(u.pathname + u.search)) continue;
      for (const key of [...u.searchParams.keys()]) if (!KEEP_PARAMS.has(key)) u.searchParams.delete(key);
      u.hash = '';
      return { url: u.href, site };
    }
    return null;
  }

  function parentOf(node) {
    if (node.parentElement) return node.parentElement;
    const root = node.getRootNode && node.getRootNode();
    return root && root.host ? root.host : null; // ra khỏi shadow DOM
  }

  /** Đi ngược lên từ thẻ <video> tới khi gặp bài viết khác; trả về liên kết bài viết gần nhất. */
  function postOfVideo(video) {
    let node = video;
    for (let depth = 0; depth < 40; depth += 1) {
      node = parentOf(node);
      if (!node || node === document.body || node === document.documentElement) break;
      if (node.querySelectorAll('video').length > 1) break; // đã lan sang bài khác
      if (node.tagName === 'A' && node.href) {
        const p = postUrl(node.href);
        if (p) return p;
      }
      for (const a of node.querySelectorAll('a[href]')) {
        const p = postUrl(a.getAttribute('href'));
        if (p) return p;
      }
    }
    return null;
  }

  function visibleArea(el) {
    const r = el.getBoundingClientRect();
    const w = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0));
    const h = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
    return w * h;
  }

  /** Các video có trên trang kèm địa chỉ bài viết; video đang phát / hiện rõ nhất đứng đầu. */
  function videoPosts(elements) {
    const out = [];
    const seen = new Set();
    const self = postUrl(location.href);
    const videos = elements.filter((el) => el.tagName === 'VIDEO');
    const scored = videos.map((v) => ({
      v, playing: !v.paused && !v.ended && v.readyState > 2, area: visibleArea(v),
    })).sort((a, b) => (b.playing - a.playing) || (b.area - a.area));
    for (const { v, playing, area } of scored) {
      const p = postOfVideo(v) || (self && videos.length === 1 ? self : null);
      if (!p || seen.has(p.url)) continue;
      seen.add(p.url);
      out.push({ ...p, playing, visible: area > 0 });
      if (out.length >= 12) break;
    }
    // Trang bài viết / reel riêng: chính địa chỉ trang là video -> đứng đầu.
    if (self) {
      const i = out.findIndex((p) => p.url === self.url);
      const item = i >= 0 ? out.splice(i, 1)[0] : { ...self, playing: false, visible: true };
      out.unshift({ ...item, page: true });
    }
    return out;
  }
  // #full-end

  // ---- Duyệt phần tử (kể cả shadow DOM mở) ---------------------------------------------------
  function allElements() {
    const out = [];
    const roots = [document];
    while (roots.length && out.length < MAX_ELEMENTS) {
      const root = roots.shift();
      for (const el of root.querySelectorAll('*')) {
        out.push(el);
        if (el.shadowRoot) roots.push(el.shadowRoot);
        if (out.length >= MAX_ELEMENTS) break;
      }
    }
    return out;
  }

  function cssUrls(value) {
    const out = [];
    if (!value || value === 'none') return out;
    for (const m of value.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/g)) out.push(m[2]);
    return out;
  }

  function pageTitle() {
    return (document.title || location.hostname).replace(/^\(\d+\)\s*/, '').replace(/\s+-\s+YouTube$/, '').trim();
  }

  // ---- Quét trang ------------------------------------------------------------------------------
  function scan() {
    const images = new Map();
    // #full-start
    const media = new Map();
    const embeds = new Map();
    // #full-end
    let playable = null;

    function addImage(raw, info = {}) {
      if (images.size >= MAX_IMAGES) return;
      const url = abs(raw);
      if (!url) return;
      const isData = url.startsWith('data:image/');
      if (!isHttp(url) && !isData) return;
      if (isData && (url.length < 6000 || url.length > 4e6 || url.startsWith('data:image/svg'))) return;
      const ups = isHttp(url) ? upgrades(url) : [];
      const candidates = [...new Set([...ups, url])];
      const key = candidates[0];
      const prev = images.get(key);
      if (prev) {
        prev.w = Math.max(prev.w, info.w || 0);
        prev.h = Math.max(prev.h, info.h || 0);
        if (!prev.alt && info.alt) prev.alt = info.alt;
        return;
      }
      const alt = String(info.alt || '').replace(/\s+/g, ' ').trim().slice(0, 120);
      images.set(key, {
        candidates,
        preview: info.preview && (isHttp(info.preview) || info.preview.startsWith('data:image/')) ? info.preview : url,
        w: info.w || 0,
        h: info.h || 0,
        alt,
        kind: info.kind || 'img',
        upgraded: ups.length > 0,
        name: guessName(url, alt),
      });
    }

    // #full-start
    function addMedia(raw, info = {}) {
      const url = abs(raw);
      if (!url || !isHttp(url) || media.has(url)) return;
      const path = pathOf(url).toLowerCase();
      const kind = path.endsWith('.m3u8') ? 'hls' : path.endsWith('.mpd') ? 'dash' : 'file';
      media.set(url, {
        url, kind, audio: AUDIO_EXT.test(path) || info.audio === true,
        w: info.w || 0, h: info.h || 0, duration: info.duration || 0, source: info.source || 'dom',
      });
    }

    function addEmbed(src) {
      const url = abs(src);
      if (!url || !isHttp(url)) return;
      const e = matchEmbed(url);
      if (e && !embeds.has(e.url)) embeds.set(e.url, e);
    }
    // #full-end

    let bgChecked = 0;
    const elements = allElements();
    for (const el of elements) {
      const tag = el.tagName;
      if (tag === 'IMG') {
        const cur = el.currentSrc || (el.getAttribute('src') ? el.src : '');
        const best = bestFromSrcset(el.getAttribute('srcset')) || bestFromSrcset(el.getAttribute('data-srcset')) ||
          abs(el.getAttribute('data-src') || el.getAttribute('data-original') || el.getAttribute('data-lazy-src') ||
              el.getAttribute('data-full') || el.getAttribute('data-large')) || abs(cur);
        const same = best === abs(cur);
        addImage(best, {
          w: same ? el.naturalWidth : 0, h: same ? el.naturalHeight : 0,
          alt: el.alt || el.title, preview: cur, kind: 'img',
        });
      } else if (tag === 'SOURCE') {
        const parent = el.parentElement && el.parentElement.tagName;
        if (parent === 'PICTURE') addImage(bestFromSrcset(el.getAttribute('srcset') || el.getAttribute('data-srcset')), { kind: 'img' });
        // #full-start
        else if (parent === 'VIDEO' || parent === 'AUDIO') addMedia(el.getAttribute('src') && el.src, { audio: parent === 'AUDIO' });
        // #full-end
      } else if (tag === 'VIDEO' || tag === 'AUDIO') {
        if (tag === 'VIDEO' && el.poster) addImage(el.poster, { kind: 'poster', alt: 'Ảnh bìa video' });
        // #full-start
        const src = el.currentSrc || (el.getAttribute('src') ? el.src : '');
        if (isHttp(src)) {
          addMedia(src, { w: el.videoWidth, h: el.videoHeight, duration: el.duration, audio: tag === 'AUDIO' });
        }
        // #full-end
        if (tag === 'VIDEO' && el.videoWidth > 0) {
          const area = el.clientWidth * el.clientHeight + (el.paused ? 0 : 1e9);
          if (!playable || area > playable.area) playable = { area, w: el.videoWidth, h: el.videoHeight };
        }
      } else if (tag === 'A') {
        const href = el.href;
        if (typeof href === 'string' && isHttp(href)) {
          const path = pathOf(href);
          if (IMG_EXT.test(path)) addImage(href, { kind: 'link', alt: el.title || el.textContent });
          // #full-start
          else if (VID_EXT.test(path)) addMedia(href, { source: 'link' });
          // #full-end
        }
      // #full-start
      } else if (tag === 'IFRAME' || tag === 'EMBED') {
        addEmbed(el.getAttribute('src') || el.getAttribute('data-src'));
      // #full-end
      } else if (tag === 'META') {
        const key = (el.getAttribute('property') || el.getAttribute('name') || el.getAttribute('itemprop') || '').toLowerCase();
        if (/^(og:image(:secure_url|:url)?|twitter:image(:src)?|image|thumbnailurl)$/.test(key)) {
          addImage(el.content, { kind: 'meta', alt: 'Ảnh đại diện trang' });
        // #full-start
        } else if (/^(og:video(:secure_url|:url)?|twitter:player:stream)$/.test(key) && isHttp(abs(el.content))) {
          const v = abs(el.content);
          if (VID_EXT.test(pathOf(v))) addMedia(v, { source: 'meta' });
          else addEmbed(v);
        // #full-end
        }
      } else if (tag === 'LINK' && /(^|\s)image_src(\s|$)/i.test(el.rel)) {
        addImage(el.href, { kind: 'meta' });
      }

      // Ảnh nền CSS (chỉ phần tử đủ lớn để bỏ qua biểu tượng)
      for (const attr of ['data-bg', 'data-background', 'data-background-image']) {
        const v = el.getAttribute && el.getAttribute(attr);
        if (v) for (const u of cssUrls(v).concat(/^(https?:|\/)/.test(v) ? [v] : [])) addImage(u, { kind: 'bg' });
      }
      if (bgChecked < MAX_BG && el.clientWidth >= 40 && el.clientHeight >= 40) {
        bgChecked += 1;
        for (const u of cssUrls(getComputedStyle(el).backgroundImage)) addImage(u, { kind: 'bg' });
      }
    }

    return {
      url: location.href,
      title: pageTitle(),
      images: [...images.values()],
      // #full-start
      media: [...media.values()],
      embeds: [...embeds.values()],
      posts: videoPosts(elements),
      // #full-end
      snapshot: playable ? { w: playable.w, h: playable.h } : null,
    };
  }

  // ---- Chụp khung hình ----------------------------------------------------------------------
  const SNAP_MIME = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };
  const SNAP_EXT = { png: 'png', jpeg: 'jpg', webp: 'webp' };

  function formatTime(sec) {
    const s = Math.max(0, Math.floor(sec || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    return h ? `${h}h${String(m).padStart(2, '0')}m${String(r).padStart(2, '0')}s` : `${m}m${String(r).padStart(2, '0')}s`;
  }

  function pickVideo() {
    const vids = [...document.querySelectorAll('video')].filter((v) => v.videoWidth > 0 && v.readyState >= 2);
    vids.sort((a, b) => ((b.paused ? 0 : 1e9) + b.clientWidth * b.clientHeight) - ((a.paused ? 0 : 1e9) + a.clientWidth * a.clientHeight));
    return vids[0] || null;
  }

  function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.style.display = 'none';
    (document.body || document.documentElement).append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function safeName(s) {
    return String(s || '').replace(/[\u0000-\u001f<>:"/\\|?*~]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'video';
  }

  async function snapshot(format = 'png', quality = 0.95, video = null) {
    if (!SNAP_MIME[format]) format = 'png';
    const v = video || pickVideo();
    if (!v) return { ok: false, error: 'Không có video nào đang hiển thị.' };
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext('2d');
    if (format === 'jpeg') {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    let blob;
    try {
      blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Không tạo được ảnh'))), SNAP_MIME[format], quality);
      });
    } catch (err) {
      if (err && err.name === 'SecurityError') {
        return { ok: false, error: 'Trang này không cho chụp khung hình video (video từ nguồn khác hoặc có bảo vệ).' };
      }
      return { ok: false, error: String(err && err.message) };
    }
    const name = `${safeName(pageTitle())} - ${formatTime(v.currentTime)}.${SNAP_EXT[format]}`;
    saveBlob(blob, name);
    return { ok: true, width: canvas.width, height: canvas.height, name };
  }

  // #full-start
  globalThis.__CT_AGENT = { version: VERSION, scan, snapshot, upgrades, pageTitle, postUrl };
  // #full-end
  /* #store-start
  globalThis.__CT_AGENT = { version: VERSION, scan, snapshot, upgrades, pageTitle };
  #store-end */
})();
