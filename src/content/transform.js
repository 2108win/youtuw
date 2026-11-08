/*
 * Biến đổi video: lật, xoay, phóng to, cắt viền và di chuyển khung hình.
 *
 * CSS áp dụng lên thẻ <video>:
 *   translate(tx, ty) scale(fx·k·z, fy·k·z) rotate(r)
 * - fx, fy (1 hoặc -1): lật. Đứng ngoài phép xoay nên "lật ngang" luôn lật
 *   theo màn hình, kể cả khi video đang xoay 90°.
 * - r: góc xoay (độ), cộng dồn để hoạt ảnh luôn quay đúng chiều.
 * - k: hệ số để video xoay ngang vẫn vừa khung trình phát.
 * - z: hệ số phóng = (lấp đầy theo vùng cắt) × (phóng tay), giới hạn 1–5.
 * - tx, ty: dịch khung hình khi đang phóng to (px trên màn hình).
 */
(() => {
  'use strict';
  const YTX = globalThis.YTX;
  if (!YTX || YTX.transform) return;

  const T = (YTX.transform = {});
  // crop: phần hình thật bên trong khung video { id, fw, fh } (tỉ lệ 0–1, căn giữa)
  const state = (T.state = { fx: 1, fy: 1, r: 0, crop: null, zoom: 1, tx: 0, ty: 0 });

  const ANIM_MS = 380;
  const MAX_ZOOM = 5;
  const MAX_FILL = 1.5; // lấp đầy tự động phóng tối đa 150% so với vừa khung
  const IDENTITY_VIEW = Object.freeze({ sx: 1, sy: 1, rot: 0, z: 1 });

  let ro = null;
  let boundPlayer = null;
  let boundVideo = null;
  let animTimer = 0;
  let clearTimer = 0;
  let lastVideoId = null;
  // Góc hiển thị = tổng các lần bấm xoay, khớp với thao tác của người dùng
  // (xoay phải rồi lật ngang -> "90° · lật ngang"), không phụ thuộc thứ tự lật/xoay.
  let turn = 0;
  // Giá trị đang áp dụng (dùng cho đèn nền vẽ đúng phần hình đang hiện).
  let view = IDENTITY_VIEW;

  const mod = (n, m) => ((n % m) + m) % m;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  T.angle = () => mod(state.r, 360);
  T.isSideways = () => T.angle() % 180 === 90;
  T.isIdentity = () =>
    state.fx === 1 && state.fy === 1 && T.angle() === 0 &&
    !state.crop && Math.abs(state.zoom - 1) < 1e-3 && !state.tx && !state.ty;
  T.isZoomed = () => view.z > 1.001;
  T.view = () => view;

  T.describe = () => ({
    angle: mod(turn, 360),
    flipH: state.fx < 0,
    flipV: state.fy < 0,
    zoom: Math.round(view.z * 100),
    crop: state.crop ? state.crop.id : null,
    active: !T.isIdentity(),
  });

  /** Kích thước phần hình thực sự hiển thị bên trong thẻ <video> (px, chưa biến đổi). */
  function contentSize(video) {
    const w = video.offsetWidth;
    const h = video.offsetHeight;
    if (!w || !h) return null;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (vw && vh && getComputedStyle(video).objectFit === 'contain') {
      const s = Math.min(w / vw, h / vh);
      return [vw * s, vh * s];
    }
    return [w, h];
  }
  T.contentSize = contentSize;

  /** Tính kích thước trên màn hình: hệ số vừa khung k, vùng hình cần lấp đầy và hệ số lấp đầy. */
  function geometry(player, video) {
    const size = contentSize(video);
    const pw = player.clientWidth;
    const ph = player.clientHeight;
    if (!size || !pw || !ph) return null;
    const side = T.isSideways();
    // Sau khi xoay 90°, chiều rộng hình = chiều cao cũ và ngược lại.
    const k = side ? Math.min(pw / size[1], ph / size[0]) : 1;
    const baseW = (side ? size[1] : size[0]) * k;
    const baseH = (side ? size[0] : size[1]) * k;
    const c = state.crop;
    const picW = baseW * (c ? (side ? c.fh : c.fw) : 1);
    const picH = baseH * (c ? (side ? c.fw : c.fh) : 1);
    let fill = 1;
    if (c) {
      // Lấp kín khung, nhưng không phóng quá MAX_FILL lần so với mức vừa khung
      // (vd. đang xoay 90° hoặc cửa sổ 4:3 thì lấp kín sẽ cắt mất quá nửa hình).
      const fit = Math.min(pw / picW, ph / picH);
      fill = Math.min(Math.max(pw / picW, ph / picH), Math.max(1, fit) * MAX_FILL);
    }
    return { pw, ph, k, picW, picH, fill };
  }

  function clearPlayer(player) {
    player.classList.remove('ytx-transformed', 'ytx-animate', 'ytx-zoomed');
    for (const v of ['--ytx-sx', '--ytx-sy', '--ytx-rot', '--ytx-tx', '--ytx-ty']) player.style.removeProperty(v);
    view = IDENTITY_VIEW;
  }

  function bind(player, video) {
    if (!ro) ro = new ResizeObserver(() => T.update());
    if (player !== boundPlayer) {
      if (boundPlayer) {
        ro.unobserve(boundPlayer);
        clearPlayer(boundPlayer);
      }
      ro.observe(player);
      boundPlayer = player;
    }
    if (video !== boundVideo) {
      if (boundVideo) {
        ro.unobserve(boundVideo);
        boundVideo.removeEventListener('loadedmetadata', T.update);
      }
      ro.observe(video);
      video.addEventListener('loadedmetadata', T.update);
      boundVideo = video;
    }
  }

  /** Tính lại và ghi biến CSS (gọi khi đổi trạng thái hoặc khung trình phát đổi kích thước). */
  T.update = () => {
    const player = YTX.getPlayer();
    const video = YTX.getVideo(player);
    if (!player || !video) return;
    bind(player, video);

    if (T.isIdentity()) {
      // Chờ hoạt ảnh trả về vị trí gốc rồi mới gỡ hẳn transform.
      if (!player.classList.contains('ytx-transformed')) return;
      if (player.classList.contains('ytx-animate')) {
        clearTimeout(clearTimer);
        clearTimer = setTimeout(() => { if (T.isIdentity()) clearPlayer(player); }, ANIM_MS + 40);
      } else {
        clearPlayer(player);
        return;
      }
    }

    const g = geometry(player, video);
    if (!g) return;
    const z = clamp(g.fill * state.zoom, 1, MAX_ZOOM);
    // Không cho kéo quá mép vùng hình.
    const maxX = Math.max(0, (g.picW * z - g.pw) / 2);
    const maxY = Math.max(0, (g.picH * z - g.ph) / 2);
    state.tx = clamp(state.tx, -maxX, maxX);
    state.ty = clamp(state.ty, -maxY, maxY);

    view = { sx: state.fx * g.k * z, sy: state.fy * g.k * z, rot: (state.r * Math.PI) / 180, z };
    const style = player.style;
    style.setProperty('--ytx-sx', String(+view.sx.toFixed(5)));
    style.setProperty('--ytx-sy', String(+view.sy.toFixed(5)));
    style.setProperty('--ytx-rot', `${state.r}deg`);
    style.setProperty('--ytx-tx', `${state.tx.toFixed(1)}px`);
    style.setProperty('--ytx-ty', `${state.ty.toFixed(1)}px`);
    player.classList.toggle('ytx-zoomed', z > 1.001);
    if (!T.isIdentity()) {
      clearTimeout(clearTimer);
      player.classList.add('ytx-transformed');
    }
  };

  /** Thay đổi trạng thái kèm hoạt ảnh. */
  function act(mutate) {
    mutate();
    const player = YTX.getPlayer();
    if (player) {
      player.classList.add('ytx-animate');
      clearTimeout(animTimer);
      animTimer = setTimeout(() => player.classList.remove('ytx-animate'), ANIM_MS + 20);
    }
    T.update();
    YTX.emit('state');
  }

  // ---- Xoay / lật -------------------------------------------------------------
  // Xoay theo chiều nhìn trên màn hình: nếu đang lật một chiều thì đảo hướng góc.
  T.rotate = (deg) => act(() => {
    state.r += deg * state.fx * state.fy;
    turn += deg;
  });
  T.flipH = () => act(() => { state.fx *= -1; });
  T.flipV = () => act(() => { state.fy *= -1; });

  // ---- Phóng to / cắt viền / di chuyển -------------------------------------------
  /** Đặt vùng hình cần lấp đầy khung (null = bỏ cắt). */
  T.setCrop = (crop) => act(() => {
    state.crop = crop;
    state.zoom = 1;
    state.tx = 0;
    state.ty = 0;
  });

  /** Phóng to/thu nhỏ thêm theo hệ số (giữ trong khoảng 100%–500%). */
  T.zoomBy = (factor) => {
    const player = YTX.getPlayer();
    const video = YTX.getVideo(player);
    const g = player && video ? geometry(player, video) : null;
    if (!g) return;
    act(() => {
      const z = clamp(g.fill * state.zoom * factor, 1, MAX_ZOOM);
      state.zoom = z / g.fill;
      if (z <= 1.001) {
        state.tx = 0;
        state.ty = 0;
      }
    });
  };

  /** Dịch khung hình (px trên màn hình), dùng khi kéo chuột. Không có hoạt ảnh. */
  T.panBy = (dx, dy) => {
    state.tx += dx;
    state.ty += dy;
    T.update();
  };

  T.resetZoom = () => act(() => {
    state.crop = null;
    state.zoom = 1;
    state.tx = 0;
    state.ty = 0;
  });

  // ---- Đặt lại -----------------------------------------------------------------------
  T.reset = (animate = true) => {
    const apply = () => {
      turn = 0;
      state.fx = 1;
      state.fy = 1;
      state.r = Math.round(state.r / 360) * 360; // quay về theo đường ngắn nhất
      state.crop = null;
      state.zoom = 1;
      state.tx = 0;
      state.ty = 0;
    };
    if (animate) act(apply);
    else {
      apply();
      state.r = 0;
      T.update();
      YTX.emit('state');
    }
  };

  /** Gọi khi YouTube chuyển trang (SPA). Đổi video -> đặt lại nếu người dùng không chọn giữ. */
  T.onNavigate = () => {
    const id = YTX.getVideoId();
    if (id && id !== lastVideoId) {
      if (lastVideoId !== null && !T.isIdentity()) {
        if (!YTX.settings.keepTransform) {
          T.reset(false);
        } else if (state.crop && state.crop.id === 'auto') {
          // Viền đen dò được chỉ đúng với video cũ.
          state.crop = null;
          state.zoom = 1;
          state.tx = 0;
          state.ty = 0;
          YTX.emit('state');
        }
      }
      lastVideoId = id;
    }
    T.update();
  };

  T.init = () => {
    lastVideoId = YTX.getVideoId();
    T.update();
  };
})();
