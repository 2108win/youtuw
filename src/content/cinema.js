/*
 * Chế độ Rạp phim: trình phát cao bằng cả màn hình ở đầu trang (dựa trên chế độ
 * rạp/theater của YouTube), vẫn lăn xuống xem tiêu đề, bình luận, đề xuất.
 * Phần viền đen quanh video được đèn nền (ambient.js) lấp đầy.
 */
(() => {
  'use strict';
  const YTX = globalThis.YTX;
  if (!YTX || YTX.cinema) return;

  const C = (YTX.cinema = { on: false });
  let turnedOnTheater = false; // ta đã tự bật theater thì khi thoát sẽ tắt lại

  const flexy = () => document.querySelector('ytd-watch-flexy');
  const isTheater = () => !!flexy()?.hasAttribute('theater');
  const clickSize = () => YTX.getPlayer()?.querySelector('.ytp-size-button')?.click();

  // YouTube tính lại kích thước video/thanh điều khiển khi cửa sổ đổi cỡ.
  function relayout() {
    window.dispatchEvent(new Event('resize'));
    setTimeout(() => window.dispatchEvent(new Event('resize')), 300);
  }

  C.set = (on) => {
    on = !!on;
    if (on && !YTX.isWatchPage()) return C.on;
    if (on === C.on) return C.on;
    C.on = on;
    if (on) {
      turnedOnTheater = !isTheater();
      if (turnedOnTheater) clickSize();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (turnedOnTheater && isTheater()) {
      clickSize();
      turnedOnTheater = false;
    }
    document.documentElement.classList.toggle('ytx-cinema', on);
    YTX.stack.sync();
    YTX.ambient.sync();
    YTX.transform.update();
    relayout();
    YTX.emit('state');
    return C.on;
  };

  C.toggle = () => C.set(!C.on);

  C.onNavigate = () => {
    if (!YTX.isWatchPage()) C.set(false);
  };
})();
