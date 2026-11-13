/*
 * Đa ngôn ngữ: lấy chuỗi giao diện từ _locales/<ngôn ngữ>/messages.json theo ngôn ngữ của trình duyệt
 * (chrome.i18n). Ngôn ngữ không có bản dịch dùng tiếng Anh (default_locale).
 *
 *   t('key', a, b)        -> chuỗi, thay $1, $2… bằng a, b (số tự đổi thành chuỗi)
 *   tn('key', n, a)       -> chọn 'key_one' / 'key_other' theo số n; $1 là n đã định dạng, $2… là a…
 *   rich('key', a)        -> DocumentFragment: **chữ đậm** -> <b>, `mã` -> <code> (không dùng innerHTML)
 *   num(n, options)       -> số theo ngôn ngữ đang hiển thị
 *   apply(root)           -> điền chữ cho [data-i18n], [data-i18n-rich], [data-i18n-title], [data-i18n-aria-label],
 *                            [data-i18n-placeholder], [data-i18n-alt]; ở trang của extension đặt luôn <html lang>.
 *
 * Tên khoá chỉ gồm a-z, 0-9, _ (chrome.i18n không phân biệt hoa thường). Khoá bắt đầu bằng "full_" chỉ có
 * ở bản đầy đủ: tools/build.mjs xoá chúng khỏi bản Chrome Web Store.
 * Trang offscreen không có chrome.i18n: trả mã lỗi để service worker dịch.
 */
(() => {
  'use strict';
  // Luôn dựng lại (rẻ): sau khi cập nhật extension, bản cũ còn trên trang gắn với ngữ cảnh đã mất.

  const api = globalThis.chrome && chrome.i18n && chrome.i18n.getMessage ? chrome.i18n : null;

  function t(key, ...subs) {
    let msg = '';
    try {
      msg = api ? api.getMessage(key, subs.length ? subs.map((s) => (s == null ? '' : String(s))) : undefined) : '';
    } catch (_) { /* quá 9 tham số hoặc ngữ cảnh đã mất */ }
    return msg || key; // thiếu khoá: hiện tên khoá cho dễ thấy lỗi, không để trống
  }

  // Ngôn ngữ thật sự đang hiển thị (có thể khác ngôn ngữ trình duyệt khi không có bản dịch).
  let locale = 'en';
  try {
    const code = api && api.getMessage('locale_code');
    if (code && Intl.NumberFormat.supportedLocalesOf([code]).length) locale = code;
  } catch (_) { /* giữ 'en' */ }

  let plural = null;
  function tn(key, n, ...subs) {
    try {
      plural = plural || new Intl.PluralRules(locale);
    } catch (_) {
      plural = { select: (x) => (x === 1 ? 'one' : 'other') };
    }
    return t(`${key}_${plural.select(n) === 'one' ? 'one' : 'other'}`, num(n), ...subs);
  }

  function num(n, options) {
    try {
      return Number(n).toLocaleString(locale, options);
    } catch (_) {
      return String(n);
    }
  }

  /** **đậm** và `mã` trong bản dịch -> phần tử thật; phần còn lại là chữ thường. */
  function rich(key, ...subs) {
    const doc = globalThis.document;
    const frag = doc.createDocumentFragment();
    const text = t(key, ...subs);
    const re = /\*\*(.+?)\*\*|`(.+?)`/g;
    let last = 0;
    let m;
    while ((m = re.exec(text))) {
      if (m.index > last) frag.append(text.slice(last, m.index));
      const el = doc.createElement(m[1] != null ? 'b' : 'code');
      el.textContent = m[1] != null ? m[1] : m[2];
      frag.append(el);
      last = re.lastIndex;
    }
    if (last < text.length) frag.append(text.slice(last));
    return frag;
  }

  const ATTRS = ['title', 'aria-label', 'placeholder', 'alt'];

  function apply(root = globalThis.document) {
    for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
    for (const el of root.querySelectorAll('[data-i18n-rich]')) el.replaceChildren(rich(el.dataset.i18nRich));
    for (const attr of ATTRS) {
      for (const el of root.querySelectorAll(`[data-i18n-${attr}]`)) {
        el.setAttribute(attr, t(el.getAttribute(`data-i18n-${attr}`)));
      }
    }
    // Chỉ đổi lang trên trang của chính extension, không đụng vào trang web (YouTube…).
    if (root === globalThis.document && globalThis.location && globalThis.location.protocol === 'chrome-extension:') {
      root.documentElement.lang = locale;
    }
  }

  globalThis.YTX_I18N = Object.freeze({ t, tn, rich, num, apply, locale });
})();
