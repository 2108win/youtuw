/*
 * Phóng to & cắt viền:
 * - Tự dò viền đen "in sẵn" trong khung hình (phim 21:9 đóng khung 16:9…).
 * - Lấp đầy khung / cắt theo tỉ lệ chọn sẵn.
 * - Kéo video để di chuyển khi đang phóng to.
 * Trạng thái và phép biến đổi nằm ở transform.js; file này chỉ tính vùng cắt và xử lý chuột.
 */
(() => {
  'use strict';
  const YTX = globalThis.YTX;
  if (!YTX || YTX.zoom || !YTX.transform) return;

  const T = YTX.transform;
  const Z = (YTX.zoom = {});
  const I18N = globalThis.YTX_I18N;

  // Tỉ lệ khung hình thật của phim. "21:9" dùng 2.39 để không còn sót viền mảnh với phim 2.35–2.39.
  const RATIOS = {
    crop21x9: { id: '21:9', ratio: 2.39 },
    crop4x3: { id: '4:3', ratio: 4 / 3 },
  };

  const SAMPLE_W = 384;     // độ phân giải lấy mẫu khi dò viền (chỉ chạy khi bấm nút)
  const DARK_LUMA = 40;     // điểm ảnh tối hơn mức này coi là đen
  const MAX_BAR = 0.3;      // viền mỗi bên tối đa 30% (nhiều hơn -> có lẽ là cảnh tối)
  const MIN_BAR = 0.02;     // viền dưới 2% thì bỏ qua

  function frameAspect(video) {
    if (video.videoWidth && video.videoHeight) return video.videoWidth / video.videoHeight;
    const size = T.contentSize(video);
    return size ? size[0] / size[1] : 0;
  }

  /**
   * Dò viền đen trong khung hình hiện tại.
   * Trả về { fw, fh } (phần hình thật, tỉ lệ 0–1) hoặc { error }.
   */
  Z.detectBars = (video) => {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh || video.readyState < 2) return { error: I18N.t('yt_err_video_not_ready') };

    const W = SAMPLE_W;
    const H = Math.max(16, Math.round((W * vh) / vw));
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const g = canvas.getContext('2d', { willReadFrequently: true });
    let data;
    try {
      g.drawImage(video, 0, 0, W, H);
      data = g.getImageData(0, 0, W, H).data;
    } catch (_) {
      return { error: I18N.t('yt_err_frame_unreadable') };
    }

    const luma = (i) => 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    // Một hàng/cột là "viền" nếu gần như toàn bộ điểm ảnh tối (cho phép ~2% nhiễu, logo nhỏ).
    const isDark = (count, at) => {
      let bright = 0;
      let sum = 0;
      for (let n = 0; n < count; n++) {
        const l = luma(at(n));
        sum += l;
        if (l > DARK_LUMA) bright++;
      }
      return bright <= count * 0.02 && sum / count < 24;
    };
    const rowDark = (y) => isDark(W, (x) => (y * W + x) * 4);
    const colDark = (x) => isDark(H, (y) => (y * W + x) * 4);

    let top = 0;
    while (top < H / 2 && rowDark(top)) top++;
    let bottom = 0;
    while (bottom < H / 2 && rowDark(H - 1 - bottom)) bottom++;
    let left = 0;
    while (left < W / 2 && colDark(left)) left++;
    let right = 0;
    while (right < W / 2 && colDark(W - 1 - right)) right++;

    if (top >= H / 2 || left >= W / 2) return { error: I18N.t('yt_err_scene_too_dark') };

    // Lấy bên nhỏ hơn để không cắt mất hình (phụ đề in trong viền dưới, cảnh tối một phía…).
    let barY = Math.min(top, bottom) / H;
    let barX = Math.min(left, right) / W;
    if (barY > MAX_BAR || barX > MAX_BAR) return { error: I18N.t('yt_err_scene_too_dark') };
    barY = barY < MIN_BAR ? 0 : barY + 0.5 / H; // cắt sâu thêm nửa điểm mẫu để không còn vệt xám
    barX = barX < MIN_BAR ? 0 : barX + 0.5 / W;
    return { fw: 1 - 2 * barX, fh: 1 - 2 * barY };
  };

  // ---- Thao tác (trả về chuỗi để hiện thông báo) ------------------------------------
  Z.autoCrop = () => {
    const video = YTX.getVideo();
    if (!video) return '';
    const res = Z.detectBars(video);
    if (res.error) return res.error;
    T.setCrop({ id: 'auto', fw: res.fw, fh: res.fh });
    const zoom = T.describe().zoom;
    if (res.fw === 1 && res.fh === 1) return I18N.t('yt_toast_no_bars', zoom);
    return I18N.t('yt_toast_bars_cropped', zoom);
  };

  Z.fill = () => {
    T.setCrop({ id: 'fill', fw: 1, fh: 1 });
    return I18N.t('yt_toast_fill', T.describe().zoom);
  };

  Z.ratio = (key) => {
    const preset = RATIOS[key];
    const video = YTX.getVideo();
    const fa = video ? frameAspect(video) : 0;
    if (!preset || !fa) return I18N.t('yt_err_video_not_ready');
    const crop = preset.ratio >= fa
      ? { id: preset.id, fw: 1, fh: fa / preset.ratio }
      : { id: preset.id, fw: preset.ratio / fa, fh: 1 };
    T.setCrop(crop);
    return I18N.t('yt_toast_crop_ratio', preset.id, T.describe().zoom);
  };

  // ---- Kéo để di chuyển khi đang phóng to ---------------------------------------------
  const NO_DRAG = '.ytp-chrome-bottom, .ytp-chrome-top, .ytp-popup, .ytx-panel, .ytp-ce-element, .ytp-cards-teaser, .ytp-ad-module, button, a, input';
  let drag = null;
  let suppressClickUntil = 0;

  function onPointerDown(e) {
    if (e.button !== 0 || !T.isZoomed()) return;
    const player = YTX.getPlayer();
    if (!player || !player.contains(e.target) || e.target.closest(NO_DRAG)) return;
    drag = { x: e.clientX, y: e.clientY, moved: false, player };
  }

  function onPointerMove(e) {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moved) {
      if (Math.hypot(dx, dy) < 5) return;
      drag.moved = true;
      drag.player.classList.add('ytx-panning');
    }
    drag.x = e.clientX;
    drag.y = e.clientY;
    T.panBy(dx, dy);
    e.preventDefault();
  }

  function onPointerUp() {
    if (!drag) return;
    if (drag.moved) {
      // Sau khi kéo, chặn cú "click" để YouTube không dừng/phát video.
      suppressClickUntil = performance.now() + 400;
      drag.player.classList.remove('ytx-panning');
    }
    drag = null;
  }

  function onClick(e) {
    if (performance.now() > suppressClickUntil) return;
    suppressClickUntil = 0;
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  Z.init = () => {
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('pointermove', onPointerMove, true);
    window.addEventListener('pointerup', onPointerUp, true);
    window.addEventListener('pointercancel', onPointerUp, true);
    window.addEventListener('click', onClick, true);
  };
})();
