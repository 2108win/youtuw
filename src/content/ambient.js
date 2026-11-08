/*
 * Đèn nền: video hoà vào ánh sáng xung quanh, đổi màu chậm và êm.
 *
 * - Lấy màu từ khung hình thu rất nhỏ (32×20), rồi làm mượt theo thời gian:
 *   màu hiển thị chỉ trôi dần về màu hiện tại (~1 giây cho lớp gần, ~2 giây cho
 *   lớp xa), nên ánh sáng không nhảy theo từng khung hình, cắt cảnh cũng chỉ
 *   chuyển màu từ từ. Tính bằng số thực nên chuyển mượt, không bị gợn.
 * - Kéo dài mép ra cả 4 phía (hàng trên kéo lên, hàng dưới kéo xuống, cột
 *   trái/phải kéo sang hai bên, góc lấy màu góc) rồi làm mờ mạnh bằng CSS.
 *   Ánh sáng chỉ nằm NGOÀI video: video luôn hiện đủ 100%, không bị che hay làm mờ mép.
 * - 2 lớp: lớp gần (sát video) và lớp xa (loang rộng, mờ nhiều, đổi màu chậm hơn).
 *
 *  - Khi tắt đèn: các lớp nằm sau trình phát (z 2101), trình phát để trong suốt,
 *    nên phần viền đen trong khung (chế độ rạp của YouTube…) và vùng bên ngoài là
 *    cùng một hình.
 *  - Toàn màn hình / Rạp phim: các lớp nằm trong trình phát, dưới video.
 */
(() => {
  'use strict';
  const YTX = globalThis.YTX;
  if (!YTX || YTX.ambient) return;

  const A = (YTX.ambient = {});
  const SRC_W = 32;          // lấy mẫu rất thô: chỉ cần mảng màu
  const SRC_H = 20;          // cố định (không theo tỉ lệ) để xoay/phóng to vẫn chuyển màu mượt
  const DENSITY = 1 / 8;     // 1 điểm canvas cho 8 px màn hình (đằng nào cũng làm mờ)
  const FRAME_MS = 33;       // ~30 lần/giây (để chuyển màu mượt, không phải để bám hình)
  const TAU_NEAR = 1.0;      // giây: lớp gần đổi được ~63% màu mới sau 1 giây
  const TAU_FAR = 2.2;       // giây: lớp xa còn chậm hơn
  const INNER_MARGIN = 110;  // px tràn ra ngoài trình phát để mép lớp mờ không bị nhạt

  let src, sctx;                 // khung hình hiện tại (thô)
  let nearSrc, nctx, farSrc, fctx; // màu đã làm mượt cho lớp gần / lớp xa
  let nearImg, farImg;           // ImageData để ghi màu đã làm mượt
  let fast = null;               // Float32Array: màu lớp gần (đang trôi về màu hiện tại)
  let slow = null;               // Float32Array: màu lớp xa
  let canRead = true;            // false nếu không đọc được điểm ảnh (video có DRM)
  let wrap, outer, octx, outerFar, ofctx, inner, ictx, innerFar, ifctx;
  let raf = 0;
  let lastDraw = 0;
  let lastSample = 0;
  let settling = false;          // màu hiển thị chưa bắt kịp màu hiện tại
  let wasActive = false;
  let outerKey = '';
  let innerKey = '';

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  function canvas2d(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return [c, c.getContext('2d', { willReadFrequently: true })];
  }

  function build() {
    [src, sctx] = canvas2d(SRC_W, SRC_H);
    [nearSrc, nctx] = canvas2d(SRC_W, SRC_H);
    [farSrc, fctx] = canvas2d(SRC_W, SRC_H);
    nearImg = nctx.createImageData(SRC_W, SRC_H);
    farImg = fctx.createImageData(SRC_W, SRC_H);
    outer = YTX.h('canvas', { id: 'ytx-glow', width: 8, height: 8 });
    octx = outer.getContext('2d');
    outerFar = YTX.h('canvas', { id: 'ytx-glow-soft', width: 8, height: 8 });
    ofctx = outerFar.getContext('2d');
    wrap = YTX.h('div', { id: 'ytx-glow-wrap', 'aria-hidden': 'true' }, [outerFar, outer]);
    inner = YTX.h('canvas', { id: 'ytx-inner-sharp', width: 8, height: 8, 'aria-hidden': 'true' });
    ictx = inner.getContext('2d');
    innerFar = YTX.h('canvas', { id: 'ytx-inner-glow', width: 8, height: 8, 'aria-hidden': 'true' });
    ifctx = innerFar.getContext('2d');
  }

  function setSize(canvas, w, h) {
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  /** Đặt vị trí/kích thước giống nhau cho lớp gần và lớp xa. */
  function placePair(pair, x, y, w, h) {
    for (const c of pair) {
      c.style.left = `${x}px`;
      c.style.top = `${y}px`;
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
      setSize(c, Math.max(8, Math.round(w * DENSITY)), Math.max(8, Math.round(h * DENSITY)));
    }
  }

  const cinemaOn = () => !!(YTX.cinema && YTX.cinema.on);
  const outerActive = () =>
    YTX.settings.glow && YTX.lights.dark && !document.fullscreenElement && !cinemaOn();
  const innerActive = () =>
    YTX.settings.glow && YTX.isWatchPage() && (cinemaOn() || (YTX.lights.dark && !!document.fullscreenElement));

  /** Cập nhật lớp nào đang bật; gọi khi đổi chế độ, cài đặt, toàn màn hình. */
  A.sync = () => {
    if (!src) build();
    if (!wrap.isConnected) document.body.append(wrap);
    const player = YTX.getPlayer();
    const out = outerActive();
    const inn = innerActive();
    document.documentElement.classList.toggle('ytx-glow-out', out);
    if (player) {
      // Lớp xa trước, lớp gần sau (cùng z-index -1 thì phần tử sau nằm trên).
      if (innerFar.parentElement !== player) player.prepend(innerFar);
      if (inner.parentElement !== player) innerFar.after(inner);
      player.classList.toggle('ytx-inner-on', inn);
    }
    // Vừa bật lại: bắt đầu từ đúng màu hiện tại, không trôi từ màu cũ.
    if ((out || inn) && !wasActive) fast = null;
    wasActive = out || inn;
    outerKey = '';
    innerKey = '';
    settling = true;
    if ((out || inn) && !raf) raf = requestAnimationFrame(tick);
  };

  /**
   * Đặt lớp ngoài: vùng hình (v) nới rộng mỗi phía một khoảng theo "Độ lan".
   * Trả về vị trí vùng hình bên trong canvas (đơn vị điểm canvas).
   */
  function placeOuter(v) {
    const pad = Math.round(v.h * (0.3 + (0.9 * YTX.settings.glowSize) / 100));
    const x = Math.round(v.left - pad + scrollX);
    const y = Math.round(v.top - pad + scrollY);
    const w = Math.round(v.w + pad * 2);
    const h = Math.round(v.h + pad * 2);
    const key = `${x},${y},${w},${h}`;
    if (key !== outerKey) {
      outerKey = key;
      placePair([outerFar, outer], x, y, w, h);
      wrap.style.setProperty('--ytx-fade', `${pad}px`);
    }
    const kx = outer.width / w;
    const ky = outer.height / h;
    return { vx: pad * kx, vy: pad * ky, vw: v.w * kx, vh: v.h * ky };
  }

  /** Đặt lớp trong trình phát (tràn ra mỗi phía INNER_MARGIN px, bị trình phát cắt đi). */
  function placeInner(pr, v) {
    const m = INNER_MARGIN;
    const w = pr.width + m * 2;
    const h = pr.height + m * 2;
    const vx = v.left - pr.left + m;
    const vy = v.top - pr.top + m;
    const key = `${Math.round(w)},${Math.round(h)},${Math.round(vx)},${Math.round(vy)},${Math.round(v.w)},${Math.round(v.h)}`;
    if (key !== innerKey) {
      innerKey = key;
      placePair([innerFar, inner], -m, -m, w, h);
      // Vị trí khung hình trong lớp gần: CSS dùng để lớp gần đậm quanh video, nhạt dần ra xa.
      const st = inner.style;
      st.setProperty('--vx', `${vx}px`);
      st.setProperty('--vy', `${vy}px`);
      st.setProperty('--vw', `${v.w}px`);
      st.setProperty('--vh', `${v.h}px`);
      st.setProperty('--fc', `${Math.round(Math.min(pr.width, pr.height) * 0.4)}px`);
    }
    const kx = inner.width / w;
    const ky = inner.height / h;
    return { vx: vx * kx, vy: vy * ky, vw: v.w * kx, vh: v.h * ky };
  }

  /**
   * Vẽ đúng phần hình đang thấy trên màn hình (vùng v) vào canvas nguồn 32×20,
   * lặp lại phép biến đổi của transform.js: xoay/lật/phóng to/di chuyển.
   */
  function grab(video, v) {
    if (video.readyState < 2) return false;
    const T = YTX.transform;
    const view = T ? T.view() : { sx: 1, sy: 1, rot: 0 };
    const size = (T && T.contentSize(video)) || [video.offsetWidth, video.offsetHeight];
    const r = video.getBoundingClientRect();
    const kx = SRC_W / v.w;
    const ky = SRC_H / v.h;
    sctx.imageSmoothingQuality = 'high';
    sctx.setTransform(kx, 0, 0, ky, -v.left * kx, -v.top * ky);
    sctx.translate(r.left + r.width / 2, r.top + r.height / 2);
    sctx.scale(view.sx, view.sy);
    sctx.rotate(view.rot);
    try {
      sctx.drawImage(video, -size[0] / 2, -size[1] / 2, size[0], size[1]);
    } catch (_) {
      return false; // video chưa sẵn sàng
    }
    return true;
  }

  /**
   * Cho màu hiển thị trôi dần về màu khung hình hiện tại (làm mượt theo thời gian).
   * dt: số giây kể từ lần trước. Trả về true nếu màu còn đang trôi.
   */
  function smooth(dt) {
    let data;
    if (canRead) {
      try {
        data = sctx.getImageData(0, 0, SRC_W, SRC_H).data;
      } catch (_) {
        canRead = false; // video có DRM: không đọc được điểm ảnh
      }
    }
    if (!data) {
      // Dự phòng: trộn thẳng trên canvas (kém mượt hơn nhưng vẫn chậm).
      const a = 1 - Math.exp(-dt / TAU_NEAR);
      const b = 1 - Math.exp(-dt / TAU_FAR);
      nctx.globalAlpha = fast ? a : 1;
      nctx.drawImage(src, 0, 0);
      fctx.globalAlpha = fast ? b : 1;
      fctx.drawImage(src, 0, 0);
      fast = fast || true;
      return true;
    }
    if (!(fast instanceof Float32Array)) {
      fast = Float32Array.from(data);
      slow = Float32Array.from(data);
    }
    const a = 1 - Math.exp(-dt / TAU_NEAR);
    const b = 1 - Math.exp(-dt / TAU_FAR);
    const nd = nearImg.data;
    const fd = farImg.data;
    let maxDiff = 0;
    for (let i = 0; i < data.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const k = i + c;
        fast[k] += (data[k] - fast[k]) * a;
        slow[k] += (data[k] - slow[k]) * b;
        nd[k] = fast[k];
        fd[k] = slow[k];
        const d = Math.abs(data[k] - slow[k]);
        if (d > maxDiff) maxDiff = d;
      }
      nd[i + 3] = 255;
      fd[i + 3] = 255;
    }
    nctx.putImageData(nearImg, 0, 0);
    fctx.putImageData(farImg, 0, 0);
    return maxDiff > 1.5;
  }

  /**
   * Vẽ khung hình (đã làm mượt) vào giữa và kéo dài mép ra 4 phía.
   * box: vị trí khung hình trong canvas đích.
   */
  function paint(ctx, canvas, box, from) {
    const cw = canvas.width;
    const ch = canvas.height;
    const W = from.width;
    const H = from.height;
    const x1 = Math.round(box.vx);
    const y1 = Math.round(box.vy);
    const x2 = Math.round(box.vx + box.vw);
    const y2 = Math.round(box.vy + box.vh);
    const vw = x2 - x1;
    const vh = y2 - y1;
    const r = W - 1;
    const b = H - 1;

    ctx.save();
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(from, 0, 0, W, H, x1, y1, vw, vh);
    // 4 cạnh
    if (y1 > 0) ctx.drawImage(from, 0, 0, W, 1, x1, 0, vw, y1);
    if (y2 < ch) ctx.drawImage(from, 0, b, W, 1, x1, y2, vw, ch - y2);
    if (x1 > 0) ctx.drawImage(from, 0, 0, 1, H, 0, y1, x1, vh);
    if (x2 < cw) ctx.drawImage(from, r, 0, 1, H, x2, y1, cw - x2, vh);
    // 4 góc
    if (x1 > 0 && y1 > 0) ctx.drawImage(from, 0, 0, 1, 1, 0, 0, x1, y1);
    if (x2 < cw && y1 > 0) ctx.drawImage(from, r, 0, 1, 1, x2, 0, cw - x2, y1);
    if (x1 > 0 && y2 < ch) ctx.drawImage(from, 0, b, 1, 1, 0, y2, x1, ch - y2);
    if (x2 < cw && y2 < ch) ctx.drawImage(from, r, b, 1, 1, x2, y2, cw - x2, ch - y2);
    ctx.restore();
  }

  /** Vùng hình thật trên màn hình (bỏ phần viền khi video dùng object-fit: contain). */
  function contentRect(video) {
    const r = video.getBoundingClientRect();
    const ew = video.offsetWidth;
    const eh = video.offsetHeight;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!ew || !eh || !vw || !vh || getComputedStyle(video).objectFit !== 'contain') return r;
    const s = Math.min(ew / vw, eh / vh);
    const cw = (vw * s) / ew; // tỉ lệ phần hình so với thẻ video
    const ch = (vh * s) / eh;
    const sideways = YTX.transform ? YTX.transform.isSideways() : false;
    const w = r.width * (sideways ? ch : cw);
    const h = r.height * (sideways ? cw : ch);
    const left = r.left + (r.width - w) / 2;
    const top = r.top + (r.height - h) / 2;
    return { left, top, right: left + w, bottom: top + h, width: w, height: h };
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);
    const out = outerActive();
    const inn = innerActive();
    if (!out && !inn) {
      cancelAnimationFrame(raf);
      raf = 0;
      return;
    }
    const player = YTX.getPlayer();
    const video = YTX.getVideo(player);
    if (!player || !video || !src) return;

    // Vùng hình đang thấy = phần hình thật ∩ khung trình phát.
    const pr = player.getBoundingClientRect();
    const vr = contentRect(video);
    const left = Math.max(pr.left, vr.left);
    const top = Math.max(pr.top, vr.top);
    const v = { left, top, w: Math.min(pr.right, vr.right) - left, h: Math.min(pr.bottom, vr.bottom) - top };
    if (v.w < 40 || v.h < 40) return;

    const outBox = out ? placeOuter(v) : null;
    const innBox = inn ? placeInner(pr, v) : null;

    if (now - lastDraw < FRAME_MS) return;
    // Video đứng yên và màu đã bắt kịp: không cần vẽ lại.
    if (video.paused && !video.seeking && !settling && fast) return;
    lastDraw = now;
    if (!grab(video, v)) return;

    const dt = clamp((now - (lastSample || now)) / 1000, 0, 0.25);
    lastSample = now;
    settling = smooth(dt || FRAME_MS / 1000);

    if (outBox) {
      paint(octx, outer, outBox, nearSrc);
      paint(ofctx, outerFar, outBox, farSrc);
    }
    if (innBox) {
      paint(ictx, inner, innBox, nearSrc);
      paint(ifctx, innerFar, innBox, farSrc);
    }
  }

  A.init = () => {
    YTX.on('settings', A.sync);
    YTX.on('state', () => { settling = true; });
    document.addEventListener('seeked', () => { settling = true; }, true);
    document.addEventListener('pause', () => { settling = true; }, true);
    document.addEventListener('fullscreenchange', () => setTimeout(A.sync, 50));
  };
})();
