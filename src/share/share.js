/*
 * Trang "Xem trước khi chia sẻ": đọc trang (HTML gốc + trang đang mở trong tab), chấm điểm,
 * mô phỏng thẻ liên kết trên từng nền tảng, liệt kê lỗi kèm cách sửa và gợi ý bộ thẻ meta.
 * Không dùng innerHTML: mọi nội dung lấy từ trang được gán qua textContent / thuộc tính.
 */
(() => {
  'use strict';
  const C = globalThis.SHARE_COLLECT;
  const K = globalThis.SHARE_CHECKS;
  const { t, tn, num } = globalThis.YTX_I18N;
  const $ = (id) => document.getElementById(id);
  globalThis.YTX_I18N.apply();

  let tabId = null;
  let runId = 0;
  let runCtrl = null;
  let objectUrls = [];

  // ---- Dựng phần tử ------------------------------------------------------------------------------
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'style') for (const [p, val] of Object.entries(v)) el.style.setProperty(p, val);
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : String(kid));
    }
    return el;
  }
  const SVG_NS = 'http://www.w3.org/2000/svg';
  function s(tag, attrs, ...kids) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, String(v));
    el.append(...kids);
    return el;
  }
  const safeHref = (u) => (/^https?:\/\//i.test(u || '') ? u : null);
  const extLink = (href, text) => h('a', { href: safeHref(href), target: '_blank', rel: 'noopener noreferrer', text });

  const STATUS_NAME = { pass: 'share_status_pass', warn: 'share_status_warn', fail: 'share_status_fail', info: 'share_status_info' };
  const STATUS_ICON = { pass: '✓', warn: '!', fail: '✕', info: 'i' };
  const PLATFORM_LABEL = { pass: 'share_platform_pass', warn: 'share_platform_warn', fail: 'share_platform_fail' };

  // ---- Trạng thái trang ----------------------------------------------------------------------------
  function show(which, text) {
    $('loading').hidden = which !== 'loading';
    $('error').hidden = which !== 'error';
    $('empty').hidden = which !== 'empty';
    $('report').hidden = which !== 'report';
    if (which === 'loading') $('loadingText').textContent = text;
    if (which === 'error') $('error').textContent = text;
    $('go').disabled = which === 'loading';
  }

  function releaseImages() {
    for (const u of objectUrls) URL.revokeObjectURL(u);
    objectUrls = [];
  }

  function normalizeInput(value) {
    let v = value.trim();
    if (!v) return '';
    // "localhost:3000/trang" hay "ten-mien.vn:8080" không phải giao thức: tự thêm http(s)://
    // (máy phát triển / mạng nội bộ thường chạy http, còn lại mặc định https).
    if (!/^https?:\/\//i.test(v)) {
      if (/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(v)) return '';
      v = `${C.isPrivateHost(`http://${v}`) ? 'http' : 'https'}://${v}`;
    }
    try {
      const u = new URL(v);
      return /^https?:$/.test(u.protocol) ? u.href : '';
    } catch (_) {
      return '';
    }
  }

  const sameDoc = (a, b) => {
    try {
      const x = new URL(a);
      const y = new URL(b);
      x.hash = '';
      y.hash = '';
      return x.href === y.href;
    } catch (_) {
      return false;
    }
  };

  async function tabUrl() {
    if (tabId == null) return '';
    try {
      const tab = await chrome.tabs.get(tabId);
      return tab.url || '';
    } catch (_) {
      tabId = null; // tab đã đóng
      return '';
    }
  }

  async function readTabHead() {
    try {
      const [r] = await chrome.scripting.executeScript({ target: { tabId }, func: C.extractHead });
      return (r && r.result) || null;
    } catch (_) {
      return null;
    }
  }

  // ---- Phân tích ----------------------------------------------------------------------------------
  async function analyze(url, useTab) {
    const id = ++runId;
    if (runCtrl) runCtrl.abort(); // huỷ các lượt tải của lần kiểm tra trước
    runCtrl = new AbortController();
    const { signal } = runCtrl;
    releaseImages();
    show('loading', t('share_loading_raw'));
    const pagePrivate = C.isPrivateHost(url);
    const [raw, dom] = await Promise.all([C.fetchPage(url, { signal }), useTab ? readTabHead() : null]);
    if (id !== runId) return;

    // Chỉ coi là "HTML gốc" khi máy chủ trả 2xx và đúng là trang HTML; trang lỗi 403/404 (vd. trang chặn bot)
    // không phải thứ cần chấm điểm, khi đó dùng trang đang hiển thị trong tab và bỏ phần so sánh.
    const rawModel = raw.ok && raw.head && raw.isHtml ? K.buildModel(raw.head, raw.url || url) : null;
    const domModel = dom ? K.buildModel(dom, dom.url || url) : null;
    const model = rawModel || domModel;
    if (!model) {
      let msg = t('share_err_unknown');
      if (raw.status) msg = t('share_err_read_status', raw.status);
      else if (raw.error) msg = t('share_err_read', raw.error);
      show('error', msg);
      return;
    }

    show('loading', t('share_loading_images'));
    const images = new Map();
    const imgUrls = [...new Set([model.og.imageAbs, model.tw.imageAbs].filter(Boolean))];
    let favUrl = model.faviconAbs;
    if (!favUrl) {
      try { favUrl = new URL('/favicon.ico', model.pageUrl).href; } catch (_) { favUrl = ''; }
    }
    const [favicon] = await Promise.all([
      favUrl ? C.loadImage(favUrl, { allowPrivate: pagePrivate, max: C.ICON_MAX, signal }) : null,
      ...imgUrls.map(async (u) => images.set(u, await C.loadImage(u, { allowPrivate: pagePrivate, signal }))),
    ]);
    const made = [favicon, ...images.values()].map((i) => i && i.objectUrl).filter(Boolean);
    if (id !== runId) {
      made.forEach((u) => URL.revokeObjectURL(u));
      return;
    }
    objectUrls = made;

    const checks = K.runChecks({ model, raw, domModel: rawModel ? domModel : null, images, favicon, pagePrivate });
    render({ url, raw, model, rawModel, domModel, checks, images, favicon, pagePrivate, useTab: !!dom });
  }

  async function start(value) {
    const url = normalizeInput(value);
    if (!url) {
      show('error', t('share_err_invalid_url'));
      return;
    }
    $('url').value = url;
    const current = await tabUrl();
    const useTab = !!current && sameDoc(current, url);
    // Không ghi địa chỉ đang kiểm tra lên thanh địa chỉ (sẽ nằm lại trong lịch sử trình duyệt); chỉ giữ số tab.
    history.replaceState(null, '', useTab ? `#tab=${tabId}` : location.pathname);
    await analyze(url, useTab);
  }

  // ---- Hiển thị ------------------------------------------------------------------------------------
  function render(r) {
    const sc = K.score(r.checks);
    const ps = K.platformStatus(r.checks);
    const v = K.views(r.model);
    // Tiêu đề tab không chứa tiêu đề trang được kiểm tra (lịch sử trình duyệt lưu tiêu đề tab).
    document.title = t('share_doc_title_score', sc.value);
    // Bỏ các mục rỗng (null): replaceChildren sẽ in null thành chữ "null".
    $('report').replaceChildren(...[
      summary(r, sc, ps),
      notices(r),
      previews(r, v, ps),
      checkList(r.checks),
      imageSection(r),
      tagTable(r),
      snippet(r),
      tools(r),
    ].filter(Boolean));
    show('report');
  }

  function section(id, title, sub, ...body) {
    return h('section', { class: 'sec', id, 'aria-labelledby': `${id}-h` },
      h('div', { class: 'sec-head' }, h('h2', { id: `${id}-h`, text: title }), sub ? h('p', { class: 'sec-sub', text: sub }) : null),
      ...body);
  }

  function summary(r, sc, ps) {
    const counts = { fail: 0, warn: 0, pass: 0 };
    for (const c of r.checks) if (c.status in counts) counts[c.status] += 1;
    const R = 52;
    const L = 2 * Math.PI * R;
    const ring = s('svg', { viewBox: '0 0 120 120', class: 'ring', 'aria-hidden': 'true' },
      s('circle', { cx: 60, cy: 60, r: R, class: 'ring-bg' }),
      s('circle', { cx: 60, cy: 60, r: R, class: 'ring-fg', 'stroke-dasharray': `${(L * sc.value) / 100} ${L}`, transform: 'rotate(-90 60 60)' }));
    return h('section', { class: `summary g-${sc.grade.id}` },
      h('div', { class: 'score', role: 'img', 'aria-label': t('share_score_aria', sc.value, sc.grade.name) },
        ring, h('div', { class: 'score-num', 'aria-hidden': 'true' }, h('strong', { text: sc.value }), h('small', { text: '/100' }))),
      h('div', { class: 'sum-main' },
        h('div', { class: 'grade', text: sc.grade.name }),
        h('h1', { class: 'page-title', text: r.model.og.title || r.model.title || t('share_page_untitled') }),
        extLink(r.model.pageUrl, r.model.pageUrl),
        h('div', { class: 'counts' },
          h('span', { class: 'count s-fail', text: tn('share_count_fail', counts.fail) }),
          h('span', { class: 'count s-warn', text: tn('share_count_warn', counts.warn) }),
          h('span', { class: 'count s-pass', text: tn('share_count_pass', counts.pass) })),
        h('nav', { class: 'chips', 'aria-label': t('share_platforms_aria') },
          K.PLATFORMS.map((p) => {
            const st = ps[p.id];
            const n = st.fails + st.warns;
            return h('a', { class: `chip s-${st.status}`, href: `#pv-${p.id}`, title: n ? t('share_chip_issues', num(st.fails), num(st.warns)) : t('share_chip_no_issues') },
              h('span', { class: 'dot', 'aria-hidden': 'true' }), p.name, h('small', { text: t(PLATFORM_LABEL[st.status]) }));
          }))));
  }

  function notices(r) {
    const list = [];
    if (r.pagePrivate) {
      list.push(['warn', t('share_notice_private')]);
    }
    if (!r.rawModel) {
      list.push(['fail', t('share_notice_no_raw')]);
    } else if (!r.useTab) {
      list.push(['info', t('share_notice_raw_only')]);
    }
    if (!list.length) return null;
    return h('div', { class: 'notices' }, list.map(([st, text]) => h('p', { class: `notice s-${st}`, text })));
  }

  // ---- Xem trước từng nền tảng ---------------------------------------------------------------------
  const usable = (info) => !!(info && info.objectUrl && info.width && info.height && info.type !== 'image/svg+xml');
  const imgEl = (info, cls) => h('img', { class: cls, src: info.objectUrl, alt: '', draggable: 'false' });
  const textOr = (cls, value, fallback) => h('div', { class: value ? cls : `${cls} empty`, text: value || fallback });

  function missNote(url, info) {
    if (usable(info)) return null;
    let text = t('share_pv_no_image');
    if (url && info && info.type === 'image/svg+xml') text = t('share_pv_svg');
    else if (url) text = t('share_pv_bad_image');
    return h('div', { class: 'pv-miss', text });
  }

  function pvFacebook(d, domain, info) {
    const ok = usable(info);
    const layout = ok && info.width >= 600 && info.height >= 315 ? 'large' : ok && info.width >= 200 && info.height >= 200 ? 'small' : 'text';
    return [missNote(d.image, info), h('div', { class: `fb fb-${layout}` },
      layout !== 'text' ? imgEl(info) : null,
      h('div', { class: 'fb-meta' },
        h('div', { class: 'fb-domain', text: domain.toUpperCase() }),
        textOr('fb-title', d.title, t('share_pv_untitled')),
        d.desc ? h('div', { class: 'fb-desc', text: d.desc }) : null))];
  }

  function pvZalo(d, domain, info) {
    return [missNote(d.image, info), h('div', { class: 'zl' },
      usable(info) ? imgEl(info) : null,
      h('div', { class: 'zl-body' },
        textOr('zl-title', d.title, t('share_pv_untitled')),
        d.desc ? h('div', { class: 'zl-desc', text: d.desc }) : null,
        h('div', { class: 'zl-domain', text: domain })))];
  }

  function pvX(d, domain, info) {
    const ok = usable(info);
    if (d.card === 'summary_large_image' && ok) {
      return [h('div', { class: 'x-large' }, imgEl(info), h('span', { class: 'x-domain', text: domain })),
        h('div', { class: 'x-from', text: t('share_x_from', domain) })];
    }
    return [missNote(d.image, info), h('div', { class: 'x-small' },
      ok ? imgEl(info, 'x-thumb') : h('div', { class: 'x-thumb x-noimg', 'aria-hidden': 'true' }),
      h('div', { class: 'x-text' },
        h('div', { class: 'x-d', text: domain }),
        textOr('x-t', d.title, t('share_pv_untitled')),
        d.desc ? h('div', { class: 'x-desc', text: d.desc }) : null))];
  }

  function pvLinkedIn(d, domain, info) {
    const ok = usable(info);
    const large = ok && info.width >= 400;
    return [missNote(d.image, info), h('div', { class: `li ${large ? 'li-large' : 'li-small'}` },
      ok ? imgEl(info) : null,
      h('div', { class: 'li-body' },
        textOr('li-title', d.title, t('share_pv_untitled')),
        h('div', { class: 'li-domain', text: domain })))];
  }

  function pvDiscord(d, domain, info) {
    const ok = usable(info);
    const color = d.color && CSS.supports('color', d.color) ? d.color : null;
    const text = h('div', { class: 'dc-text' },
      d.site ? h('div', { class: 'dc-site', text: d.site }) : null,
      textOr('dc-title', d.title, t('share_pv_untitled')),
      d.desc ? h('div', { class: 'dc-desc', text: d.desc }) : null);
    return [missNote(d.image, info), h('div', { class: `dc ${ok && !d.large ? 'dc-has-thumb' : ''}`, style: color ? { '--bar': color } : null },
      text,
      ok && !d.large ? imgEl(info, 'dc-thumb') : null,
      ok && d.large ? imgEl(info, 'dc-img') : null)];
  }

  function pvTelegram(d, pageUrl, info) {
    const ok = usable(info);
    const large = ok && info.width >= 600;
    return [missNote(d.image, info), h('div', { class: 'tg' },
      h('div', { class: 'tg-link', text: pageUrl }),
      h('div', { class: `tg-pv ${ok && !large ? 'tg-has-thumb' : ''}` },
        ok && !large ? imgEl(info, 'tg-thumb') : null,
        h('div', { class: 'tg-site', text: d.site }),
        d.title ? h('div', { class: 'tg-title', text: d.title }) : null,
        d.desc ? h('div', { class: 'tg-desc', text: d.desc }) : null,
        large ? imgEl(info, 'tg-img') : null))];
  }

  function pvGoogle(d, favicon) {
    let crumbs = d.url;
    try {
      const u = new URL(d.url);
      const parts = u.pathname.split('/').filter(Boolean).map((p) => {
        try { return decodeURIComponent(p); } catch (_) { return p; }
      });
      crumbs = [`${u.protocol}//${u.host}`, ...parts].join(' › ');
    } catch (_) { /* giữ nguyên */ }
    return h('div', { class: 'gg' },
      h('div', { class: 'gg-head' },
        h('span', { class: 'gg-fav' }, favicon && favicon.objectUrl ? h('img', { src: favicon.objectUrl, alt: '' }) : null),
        h('div', { class: 'gg-site' }, h('div', { class: 'gg-name', text: d.site }), h('div', { class: 'gg-url', text: crumbs }))),
      textOr('gg-title', d.title, t('share_pv_untitled')),
      textOr('gg-desc', d.desc, t('share_google_no_desc')));
  }

  function previews(r, v, ps) {
    const img = (u) => r.images.get(u);
    const items = {
      facebook: pvFacebook(v.facebook, v.domain, img(v.facebook.image)),
      zalo: pvZalo(v.zalo, v.domain, img(v.zalo.image)),
      x: pvX(v.x, v.domain, img(v.x.image)),
      linkedin: pvLinkedIn(v.linkedin, v.domain, img(v.linkedin.image)),
      discord: pvDiscord(v.discord, v.domain, img(v.discord.image)),
      telegram: pvTelegram(v.telegram, r.model.pageUrl, img(v.telegram.image)),
      google: pvGoogle(v.google, r.favicon),
    };
    return section('pv', t('share_sec_preview'), t('share_sec_preview_sub'),
      h('div', { class: 'pv-grid' }, K.PLATFORMS.map((p) => h('article', { class: 'pv', id: `pv-${p.id}` },
        h('header', { class: 'pv-head' },
          h('strong', { text: p.name }),
          h('span', { class: `tag s-${ps[p.id].status}`, text: t(PLATFORM_LABEL[ps[p.id].status]) })),
        h('div', { class: `pv-stage st-${p.id}` }, items[p.id])))));
  }

  // ---- Danh sách kiểm tra ----------------------------------------------------------------------------
  function checkList(checks) {
    const order = { fail: 0, warn: 1, pass: 2, info: 3 };
    const counts = { all: checks.length, fail: 0, warn: 0, pass: 0 };
    for (const c of checks) if (c.status in counts) counts[c.status] += 1;
    const wrap = h('div', { class: 'checks', 'data-filter': 'issues' });
    const groups = K.GROUPS.map((g) => {
      const items = checks.filter((c) => c.group === g.id).sort((a, b) => order[a.status] - order[b.status]);
      if (!items.length) return null;
      return h('div', { class: 'grp' }, h('h3', { text: g.name }), h('ul', {}, items.map((c) => h('li', { class: `ck s-${c.status}` },
        h('span', { class: 'ck-ic', 'aria-hidden': 'true', text: STATUS_ICON[c.status] }),
        h('div', { class: 'ck-body' },
          h('div', { class: 'ck-title' }, h('span', { class: 'sr-only', text: `${t(STATUS_NAME[c.status])} ` }), c.title),
          c.detail ? h('div', { class: 'ck-detail', text: c.detail }) : null,
          c.fix && c.status !== 'pass' ? h('div', { class: 'ck-fix' }, h('b', { text: `${t('share_fix_label')} ` }), c.fix) : null)))));
    });
    wrap.append(...groups.filter(Boolean));
    const filters = [
      ['issues', t('share_filter_issues', num(counts.fail + counts.warn))],
      ['fail', t('share_filter_fail', num(counts.fail))],
      ['all', t('share_filter_all', num(counts.all))],
    ];
    const bar = h('div', { class: 'filters', role: 'group', 'aria-label': t('share_filter_aria') }, filters.map(([f, label]) => h('button', {
      type: 'button', 'aria-pressed': String(f === 'issues'), text: label,
      onclick: (e) => {
        for (const b of bar.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
        wrap.dataset.filter = f;
        applyFilter(wrap);
      },
    })));
    applyFilter(wrap);
    return section('checks', t('share_sec_checks'), null, bar, wrap);
  }

  function applyFilter(wrap) {
    const f = wrap.dataset.filter;
    const visible = (li) => f === 'all' || (f === 'fail' ? li.classList.contains('s-fail') : li.classList.contains('s-fail') || li.classList.contains('s-warn'));
    let any = false;
    for (const grp of wrap.querySelectorAll('.grp')) {
      let shown = 0;
      for (const li of grp.querySelectorAll('.ck')) {
        li.hidden = !visible(li);
        if (!li.hidden) shown += 1;
      }
      grp.hidden = !shown;
      any = any || shown > 0;
    }
    let none = wrap.querySelector('.none');
    if (!none) {
      none = h('p', { class: 'none', text: t('share_checks_none') });
      wrap.append(none);
    }
    none.hidden = any;
  }

  // ---- Ảnh chia sẻ -----------------------------------------------------------------------------------
  function imageSection(r) {
    const url = r.model.og.imageAbs;
    if (!url) return null;
    const info = r.images.get(url) || {};
    let bytes = '—';
    if (info.size) bytes = info.tooLarge ? t('share_img_bytes_min', K.fmtBytes(info.size)) : K.fmtBytes(info.size);
    let http = info.error || '—';
    if (info.status) http = info.redirected ? t('share_img_status_redirected', info.status) : `${info.status}`;
    const rows = [
      [t('share_img_url'), extLink(url, url)],
      [t('share_img_size'), info.width ? `${info.width} × ${info.height} px` : '—'],
      [t('share_img_ratio'), info.width ? t('share_img_ratio_value', num(info.width / info.height, { maximumFractionDigits: 2 })) : '—'],
      [t('share_img_bytes'), bytes],
      [t('share_img_format'), info.type || info.contentType || '—'],
      [t('share_img_http'), http],
    ];
    let note = info.error || t('share_img_cannot_view');
    if (info.type === 'image/svg+xml') note = t('share_img_svg');
    else if (info.tooLarge) note = t('share_img_too_large');
    else if (info.decodeError) note = t('share_img_decode_error');
    else if (info.width && !info.objectUrl) note = t('share_img_too_many_pixels');
    let frame = h('div', { class: 'img-frame empty', text: note });
    if (info.objectUrl) {
      let guide = null;
      if (info.width && info.height) {
        const ratio = info.width / info.height;
        const style = ratio > 1.91
          ? { width: `${(1.91 / ratio) * 100}%`, height: '100%' }
          : { width: '100%', height: `${(ratio / 1.91) * 100}%` };
        if (Math.abs(ratio - 1.91) > 0.02) guide = h('div', { class: 'crop', style, title: t('share_img_crop_title') });
      }
      frame = h('figure', { class: 'img-frame' }, h('div', { class: 'img-box' }, h('div', { class: 'img-inner' }, imgEl(info), guide)),
        guide ? h('figcaption', { text: t('share_img_crop_caption') }) : null);
    }
    return section('img', t('share_sec_image'), null,
      h('div', { class: 'img-wrap' }, frame,
        h('dl', { class: 'facts' }, rows.map(([k, val]) => [h('dt', { text: k }), h('dd', {}, val)]))));
  }

  // ---- Bảng thẻ ----------------------------------------------------------------------------------------
  function tagTable(r) {
    const raw = r.rawModel ? K.trackedTags(r.rawModel) : new Map();
    const dom = r.domModel ? K.trackedTags(r.domModel) : new Map();
    const keys = [...new Set([...raw.keys(), ...dom.keys()])];
    const rank = (k) => (k === '<title>' ? 0 : k === 'description' ? 1 : k === 'canonical' ? 2 : k.startsWith('og:') ? 3 : k.startsWith('twitter:') ? 4 : 5);
    keys.sort((a, b) => rank(a) - rank(b));
    if (!keys.length) return section('tags', t('share_sec_tags'), null, h('p', { class: 'muted', text: t('share_tags_none') }));
    const rows = keys.map((k) => {
      const a = raw.get(k);
      const b = dom.get(k);
      let src = t('share_src_raw');
      let cls = '';
      if (!r.rawModel) src = t('share_src_dom');
      else if (!r.domModel) src = t('share_src_raw');
      else if (a == null) { src = t('share_src_js_only'); cls = 's-fail'; }
      else if (b == null) src = t('share_src_raw');
      else if (a !== b) { src = t('share_src_js_changed'); cls = 's-warn'; }
      const value = a != null ? a : b;
      return h('tr', {},
        h('td', { class: 'k', text: k }),
        h('td', { class: 'v' }, h('div', { text: value }), a != null && b != null && a !== b ? h('div', { class: 'after', text: t('share_tags_after_js', b) }) : null),
        h('td', { class: 'src' }, h('span', { class: `tag ${cls}`, text: src })));
    });
    return section('tags', t('share_sec_tags'), t('share_sec_tags_sub'),
      h('div', { class: 'table-wrap' }, h('table', { class: 'tags' },
        h('thead', {}, h('tr', {}, h('th', { text: t('share_th_tag') }), h('th', { text: t('share_th_value') }), h('th', { text: t('share_th_source') }))),
        h('tbody', {}, rows))));
  }

  // ---- Bộ thẻ gợi ý --------------------------------------------------------------------------------------
  function snippet(r) {
    const lines = K.suggestTags(r.model, r.images);
    const changes = lines.filter((l) => l.state === 'add' || l.state === 'fix').length;
    const mark = { add: '+', fix: '~', keep: ' ', note: ' ' };
    const code = h('pre', { class: 'code', tabindex: '0' }, h('code', {}, lines.map((l) => h('span', { class: `ln st-${l.state}`, 'data-mark': mark[l.state], text: l.text }))));
    const status = h('span', { class: 'copied', role: 'status' });
    const copy = h('button', {
      type: 'button', class: 'primary', text: t('share_copy'),
      onclick: async () => {
        try {
          await navigator.clipboard.writeText(lines.map((l) => l.text).join('\n'));
          status.textContent = t('share_copied');
        } catch (err) {
          status.textContent = t('share_copy_failed', err.message);
        }
      },
    });
    return section('snippet', t('share_sec_snippet'),
      changes ? tn('share_snippet_changes', changes) : t('share_snippet_complete'),
      code, h('div', { class: 'snippet-actions' }, copy, status));
  }

  function tools(r) {
    // Địa chỉ đang kiểm tra (không dùng og:url do trang tự khai báo).
    const url = r.model.pageUrl;
    const body = [
      h('p', { class: 'muted', text: t('share_tools_how') }),
      h('p', { class: 'muted', text: t('share_tools_caveat') }),
    ];
    if (r.pagePrivate) {
      body.push(h('p', { class: 'muted', text: t('share_tools_private') }));
    } else {
      const enc = encodeURIComponent(url);
      body.push(h('ul', { class: 'links' },
        h('li', {}, extLink(`https://developers.facebook.com/tools/debug/?q=${enc}`, 'Facebook Sharing Debugger'), ` ${t('share_tool_fb_note')}`),
        h('li', {}, extLink(`https://www.linkedin.com/post-inspector/inspect/${enc}`, 'LinkedIn Post Inspector')),
        h('li', {}, extLink(`https://search.google.com/test/rich-results?url=${enc}`, 'Google Rich Results Test'), ` ${t('share_tool_google_note')}`)));
    }
    return section('tools', t('share_sec_tools'), null, ...body);
  }

  // ---- Khởi động ---------------------------------------------------------------------------------------
  $('form').addEventListener('submit', (e) => {
    e.preventDefault();
    start($('url').value);
  });

  async function boot() {
    const p = new URLSearchParams(location.hash.slice(1));
    if (p.has('tab')) {
      tabId = Number(p.get('tab'));
      const url = await tabUrl();
      if (!/^https?:/i.test(url)) {
        show('error', url ? t('share_err_not_web') : t('share_err_tab_closed'));
        return;
      }
      $('url').value = url;
      analyze(url, true);
    } else if (p.get('url')) {
      start(p.get('url'));
    } else {
      show('empty');
      $('url').focus();
    }
  }
  // Đổi địa chỉ (#url=… / #tab=…) bằng tay thì kiểm tra lại; history.replaceState của trang không gây sự kiện này.
  window.addEventListener('hashchange', boot);
  boot();
})();
