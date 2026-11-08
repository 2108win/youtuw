/*
 * Dữ liệu dùng chung cho content script và popup:
 * cài đặt mặc định, tên thao tác, phím tắt và biểu tượng SVG.
 */
(() => {
  'use strict';
  if (globalThis.YTX_SHARED) return;

  const DEFAULTS = Object.freeze({
    dim: 0.92,           // Độ tối màn che khi tắt đèn (0.5 – 1)
    glow: true,          // Bật đèn nền phía sau trình phát
    glowStrength: 0.9,   // Độ sáng đèn nền (0.2 – 1)
    glowSize: 50,        // Độ lan đèn nền (0 – 100)
    keepTransform: false, // Giữ xoay/lật/phóng to khi chuyển sang video khác
    playerButtons: true, // Hiện nút trên thanh điều khiển của trình phát
    shortcuts: true,     // Bật phím tắt bàn phím
    // #full-start
    dlCookies: true,     // Tải video: dùng phiên đăng nhập của trình duyệt (trừ YouTube)
    // #full-end
    autoPip: true,       // YouTube: tự mở cửa sổ nổi khi chuyển sang tab khác
  });

  const LABELS = Object.freeze({
    flipH: 'Lật ngang',
    flipV: 'Lật dọc',
    rotateLeft: 'Xoay trái 90°',
    rotateRight: 'Xoay phải 90°',
    rotate180: 'Xoay 180°',
    resetTransform: 'Đặt lại',
    toggleLights: 'Tắt / bật đèn',
    toggleCinema: 'Rạp phim',
    autoCrop: 'Tự cắt viền đen',
    fillFrame: 'Lấp đầy khung',
    crop21x9: 'Cắt theo 21:9',
    crop4x3: 'Cắt theo 4:3',
    zoomIn: 'Phóng to',
    zoomOut: 'Thu nhỏ',
    resetZoom: 'Bỏ phóng to',
    snapshot: 'Chụp khung hình',
    // #full-start
    downloadThumb: 'Tải ảnh bìa',
    // #full-end
    togglePip: 'Cửa sổ nổi',
  });

  // Phím tắt: Alt + Shift + phím (dùng event.code nên không phụ thuộc bộ gõ).
  const SHORTCUTS = Object.freeze([
    { code: 'KeyL', key: 'L', action: 'toggleLights' },
    { code: 'KeyC', key: 'C', action: 'toggleCinema' },
    { code: 'KeyH', key: 'H', action: 'flipH' },
    { code: 'KeyV', key: 'V', action: 'flipV' },
    { code: 'KeyE', key: 'E', action: 'rotateLeft' },
    { code: 'KeyR', key: 'R', action: 'rotateRight' },
    { code: 'Digit0', key: '0', action: 'resetTransform' },
    { code: 'KeyA', key: 'A', action: 'autoCrop' },
    { code: 'Equal', key: '+', action: 'zoomIn' },
    { code: 'Minus', key: '−', action: 'zoomOut' },
    { code: 'KeyS', key: 'S', action: 'snapshot' },
    { code: 'KeyP', key: 'P', action: 'togglePip' },
  ]);

  // Biểu tượng 24x24, vẽ bằng nét (stroke = currentColor).
  const ICONS = Object.freeze({
    transform: [
      ['rect', { x: 3, y: 9, width: 12, height: 10, rx: 2 }],
      ['path', { d: 'M13 3.5a7.5 7.5 0 0 1 7.5 7.5' }],
      ['path', { d: 'M18 8.6l2.5 2.6 2.5-2.6' }],
    ],
    lights: [
      ['path', { d: 'M9 18.5h6' }],
      ['path', { d: 'M10 21.5h4' }],
      ['path', { class: 'ytx-bulb', d: 'M12 2.5a6.5 6.5 0 0 0-4 11.6c.6.5 1 1.2 1 2v.4h6v-.4c0-.8.4-1.5 1-2A6.5 6.5 0 0 0 12 2.5z' }],
    ],
    cinema: [
      ['rect', { x: 5.5, y: 7.5, width: 13, height: 9, rx: 1.5 }],
      ['path', { d: 'M2 7V3h4' }],
      ['path', { d: 'M22 7V3h-4' }],
      ['path', { d: 'M2 17v4h4' }],
      ['path', { d: 'M22 17v4h-4' }],
    ],
    flipH: [
      ['path', { d: 'M12 3v18', 'stroke-dasharray': '2 2.5' }],
      ['path', { d: 'M9 7L3 17h6z' }],
      ['path', { d: 'M15 7l6 10h-6z' }],
    ],
    flipV: [
      ['path', { d: 'M3 12h18', 'stroke-dasharray': '2 2.5' }],
      ['path', { d: 'M7 9l10-6v6z' }],
      ['path', { d: 'M7 15l10 6v-6z' }],
    ],
    rotateLeft: [
      ['path', { d: 'M19 14a7 7 0 0 0-14 0' }],
      ['path', { d: 'M2 11l3 3 3-3' }],
      ['rect', { x: 8, y: 17, width: 8, height: 4.5, rx: 1 }],
    ],
    rotateRight: [
      ['path', { d: 'M5 14a7 7 0 0 1 14 0' }],
      ['path', { d: 'M16 11l3 3 3-3' }],
      ['rect', { x: 8, y: 17, width: 8, height: 4.5, rx: 1 }],
    ],
    rotate180: [
      ['path', { d: 'M5 12a7 7 0 1 1 7 7' }],
      ['path', { d: 'M15 16l-3 3 3 3' }],
    ],
    resetTransform: [
      ['path', { d: 'M4 13a8 8 0 1 0 2.34-5.66' }],
      ['path', { d: 'M6.3 3v4.3h4.3' }],
    ],
    autoCrop: [
      ['path', { d: 'M7 3v12a2 2 0 0 0 2 2h12' }],
      ['path', { d: 'M17 21V9a2 2 0 0 0-2-2H3' }],
    ],
    fillFrame: [
      ['rect', { x: 7.5, y: 8.5, width: 9, height: 7, rx: 1 }],
      ['path', { d: 'M3 8V4h4' }],
      ['path', { d: 'M21 8V4h-4' }],
      ['path', { d: 'M3 16v4h4' }],
      ['path', { d: 'M21 16v4h-4' }],
    ],
    zoomIn: [
      ['circle', { cx: 10.5, cy: 10.5, r: 6.5 }],
      ['path', { d: 'M15.5 15.5L21 21' }],
      ['path', { d: 'M10.5 7.5v6M7.5 10.5h6' }],
    ],
    zoomOut: [
      ['circle', { cx: 10.5, cy: 10.5, r: 6.5 }],
      ['path', { d: 'M15.5 15.5L21 21' }],
      ['path', { d: 'M7.5 10.5h6' }],
    ],
    download: [
      ['path', { d: 'M12 3.5v11.5' }],
      ['path', { d: 'M7.5 10.5L12 15l4.5-4.5' }],
      ['path', { d: 'M4.5 19.5h15' }],
    ],
    video: [
      ['rect', { x: 2.5, y: 6, width: 13.5, height: 12, rx: 2 }],
      ['path', { d: 'M16 10.5l5.5-3.2v9.4L16 13.5' }],
    ],
    music: [
      ['path', { d: 'M9 17.5V6l11-2.2v11.5' }],
      ['circle', { cx: 6.5, cy: 17.5, r: 2.5 }],
      ['circle', { cx: 17.5, cy: 15.3, r: 2.5 }],
    ],
    image: [
      ['rect', { x: 3, y: 4.5, width: 18, height: 15, rx: 2 }],
      ['circle', { cx: 8.5, cy: 9.5, r: 1.7 }],
      ['path', { d: 'M4 17.5l5-5 3.5 3.5 3-3 4.5 4.5' }],
    ],
    camera: [
      ['path', { d: 'M4 8h3l1.6-2.5h6.8L17 8h3a1 1 0 0 1 1 1v9.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z' }],
      ['circle', { cx: 12, cy: 13.5, r: 3.6 }],
    ],
    folder: [
      ['path', { d: 'M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' }],
    ],
    play: [
      ['path', { d: 'M8 5.5v13l10.5-6.5z' }],
    ],
    close: [
      ['path', { d: 'M6.5 6.5l11 11M17.5 6.5l-11 11' }],
    ],
    check: [
      ['path', { d: 'M5 12.5l4.5 4.5L19 7.5' }],
    ],
    pip: [
      ['rect', { x: 2.5, y: 4.5, width: 19, height: 15, rx: 2 }],
      ['rect', { x: 11.5, y: 11.5, width: 7.5, height: 5.5, rx: 1, fill: 'currentColor' }],
    ],
    gear: [
      ['circle', { cx: 12, cy: 12, r: 3 }],
      ['path', { d: 'M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7' }],
      ['circle', { cx: 12, cy: 12, r: 6.6 }],
    ],
    shotFull: [
      ['rect', { x: 6, y: 2.5, width: 12, height: 19, rx: 1.8 }],
      ['path', { d: 'M9.5 8.5L12 6l2.5 2.5M9.5 15.5L12 18l2.5-2.5M12 6v12' }],
    ],
    shotVisible: [
      ['rect', { x: 3, y: 5, width: 18, height: 13, rx: 1.8 }],
      ['path', { d: 'M8 21h8' }],
      ['circle', { cx: 12, cy: 11.5, r: 2.6 }],
    ],
    shotRegion: [
      ['path', { d: 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3' }],
      ['path', { d: 'M12 9v6M9 12h6' }],
    ],
    speaker: [
      ['path', { d: 'M4 9.5h3.5L12 6v12l-4.5-3.5H4z' }],
      ['path', { d: 'M15.5 9.2a4 4 0 0 1 0 5.6' }],
      ['path', { d: 'M18 6.6a7.5 7.5 0 0 1 0 10.8' }],
    ],
    speakerOff: [
      ['path', { d: 'M4 9.5h3.5L12 6v12l-4.5-3.5H4z' }],
      ['path', { d: 'M16 9.5l5 5M21 9.5l-5 5' }],
    ],
    stream: [
      ['path', { d: 'M5 12a7 7 0 0 1 14 0' }],
      ['path', { d: 'M8.5 12a3.5 3.5 0 0 1 7 0' }],
      ['circle', { cx: 12, cy: 15.5, r: 1.6 }],
      ['path', { d: 'M12 17.1V21' }],
    ],
  });

  const SVG_NS = 'http://www.w3.org/2000/svg';

  /** Tạo phần tử <svg> từ định nghĩa ICONS (không dùng innerHTML vì YouTube bật Trusted Types). */
  function createIcon(name, doc = document) {
    const svg = doc.createElementNS(SVG_NS, 'svg');
    const attrs = {
      viewBox: '0 0 24 24', width: 24, height: 24, fill: 'none', stroke: 'currentColor',
      'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      'aria-hidden': 'true', focusable: 'false',
    };
    for (const [k, v] of Object.entries(attrs)) svg.setAttribute(k, String(v));
    for (const [tag, childAttrs] of ICONS[name] || []) {
      const node = doc.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(childAttrs)) node.setAttribute(k, String(v));
      svg.append(node);
    }
    return svg;
  }

  // ---- Tải về: định dạng số liệu & mô tả tiến độ (dùng chung cho popup và trình phát) ----------
  const fmt = {
    bytes(n) {
      if (!n || n < 0) return '';
      const units = ['B', 'KB', 'MB', 'GB', 'TB'];
      let i = 0;
      while (n >= 1024 && i < units.length - 1) { n /= 1024; i += 1; }
      return `${n.toLocaleString('vi-VN', { maximumFractionDigits: n < 10 && i > 1 ? 1 : 0 })} ${units[i]}`;
    },
    duration(sec) {
      sec = Math.max(0, Math.round(sec || 0));
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = String(sec % 60).padStart(2, '0');
      return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
    },
  };

  // #full-start
  const STAGES = {
    Merger: 'Đang ghép hình và tiếng…',
    ExtractAudio: 'Đang chuyển định dạng âm thanh…',
    Metadata: 'Đang ghi thông tin vào tệp…',
    MoveFiles: 'Đang lưu tệp…',
    VideoRemuxer: 'Đang đổi định dạng…',
    VideoConvertor: 'Đang đổi định dạng…',
    EmbedThumbnail: 'Đang gắn ảnh bìa…',
  };

  function describeChoice(c) {
    if (!c) return '';
    if (c.mode === 'audio') return `Âm thanh ${c.audioFormat.toUpperCase()}`;
    return `${c.quality === 'best' ? 'Tốt nhất' : `${c.quality}p`} · ${c.container.toUpperCase()}`;
  }

  /** Một dòng mô tả trạng thái của lượt tải video. */
  function describeJob(job) {
    switch (job.status) {
      case 'starting':
        return 'Đang lấy thông tin video…';
      case 'downloading': {
        const part = job.part === 'audio' ? 'Âm thanh' : job.height ? `Hình ${job.height}p` : 'Đang tải';
        const bits = [`${part} ${job.percent != null ? `${Math.floor(job.percent)}%` : ''}`.trim()];
        if (job.speed) bits.push(`${fmt.bytes(job.speed)}/s`);
        if (job.eta != null && job.eta > 0) bits.push(`còn ${fmt.duration(job.eta)}`);
        return bits.join(' · ');
      }
      case 'processing':
        return STAGES[job.stage] || (/^Fixup/.test(job.stage || '') ? 'Đang sửa tệp…' : 'Đang xử lý…');
      case 'done':
        return `Đã lưu${job.size ? ` · ${fmt.bytes(job.size)}` : ''}`;
      case 'cancelled':
        return 'Đã huỷ';
      case 'error':
        return `Lỗi: ${job.error || 'không rõ'}`;
      default:
        return '';
    }
  }

  /** Đưa các dạng địa chỉ YouTube (shorts, youtu.be, nhúng, có playlist) về một video. */
  function canonicalVideoUrl(raw) {
    let u;
    try {
      u = new URL(raw);
    } catch (_) {
      return raw;
    }
    const host = u.hostname.replace(/^(www|m|music)\./, '');
    let m;
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      const v = u.searchParams.get('v');
      if (u.pathname === '/watch' && /^[\w-]{11}$/.test(v || '')) return `https://www.youtube.com/watch?v=${v}`;
      if ((m = u.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]{11})/))) return `https://www.youtube.com/watch?v=${m[1]}`;
    }
    if (host === 'youtu.be' && (m = u.pathname.match(/^\/([\w-]{11})/))) return `https://www.youtube.com/watch?v=${m[1]}`;
    return raw;
  }
  // #full-end

  /**
   * Bật / tắt cửa sổ nổi cho video trong một tab bất kỳ (gọi từ popup hoặc phím tắt của service worker).
   * Phải gọi ngay khi người dùng bấm: trình duyệt chỉ cho mở cửa sổ nổi ngay sau một thao tác của người dùng,
   * nên nạp pip.js và lệnh mở trong cùng một lần chèn.
   */
  async function pipInTab(tabId) {
    const run = async (allFrames, runner) => {
      const results = await chrome.scripting.executeScript({
        target: { tabId, allFrames }, files: ['src/page/pip.js', runner],
      });
      return results.map((r) => r.result).filter(Boolean);
    };
    try {
      const [main] = await run(false, 'src/page/pip-run.js');
      if (main && (main.ok || main.reason !== 'no-video')) return main;
      // Video nằm trong khung con (video nhúng): dùng cửa sổ nổi thường của trình duyệt.
      const frames = await run(true, 'src/page/pip-run-frame.js');
      return frames.find((r) => r.ok) || frames.find((r) => r.reason !== 'no-video') || main
        || { ok: false, reason: 'no-video', error: 'Không thấy video nào trên trang này.' };
    } catch (err) {
      return { ok: false, reason: 'error', error: 'Không dùng được cửa sổ nổi ở trang này.' };
    }
  }

  // #full-start
  globalThis.YTX_SHARED = Object.freeze({
    DEFAULTS, LABELS, SHORTCUTS, ICONS, createIcon, fmt, describeChoice, describeJob, canonicalVideoUrl, pipInTab,
  });
  // #full-end
  /* #store-start
  globalThis.YTX_SHARED = Object.freeze({ DEFAULTS, LABELS, SHORTCUTS, ICONS, createIcon, fmt, pipInTab });
  #store-end */
})();
