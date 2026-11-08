/*
 * Phím tắt: Alt + Shift + phím (YouTube đã dùng hầu hết phím đơn).
 * Esc: bật lại đèn khi đang tắt đèn.
 */
(() => {
  'use strict';
  const YTX = globalThis.YTX;
  if (!YTX || YTX.shortcuts) return;

  const byCode = new Map(YTX.SHORTCUTS.map((s) => [s.code, s.action]));

  function onKeyDown(e) {
    if (e.defaultPrevented || e.isComposing) return;
    if (YTX.isEditable(e.target) || YTX.isEditable(document.activeElement)) return;

    if (e.key === 'Escape' && !document.fullscreenElement && !e.altKey && !e.ctrlKey &&
        (YTX.cinema.on || YTX.lights.dark)) {
      // YouTube dùng Esc để thoát chế độ rạp của nó -> chặn lại.
      // Esc thoát Rạp phim trước, nhấn tiếp thì bật lại đèn.
      e.preventDefault();
      e.stopImmediatePropagation();
      YTX.run(YTX.cinema.on ? 'toggleCinema' : 'toggleLights');
      return;
    }

    if (!YTX.settings.shortcuts) return;
    if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) return;
    const action = byCode.get(e.code);
    if (!action) return;
    if (!YTX.getVideo()) return;

    e.preventDefault();
    e.stopImmediatePropagation();
    YTX.run(action);
  }

  YTX.shortcuts = {
    init() {
      window.addEventListener('keydown', onKeyDown, true);
    },
  };
})();
