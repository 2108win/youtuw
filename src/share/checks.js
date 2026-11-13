/*
 * Xem trước khi chia sẻ – dựng dữ liệu, các quy tắc kiểm tra và chấm điểm.
 *
 * Giới hạn cứng chỉ lấy từ tài liệu chính thức của nền tảng (ảnh Facebook: khuyên 1200×630, dưới 600×315 hiện ảnh nhỏ,
 * dưới 200×200 bị bỏ, tối đa 8 MB; ảnh X tối đa 5 MB; og:image phải là địa chỉ đầy đủ). Độ dài tiêu đề / mô tả chỉ là
 * khuyến nghị thường dùng ("dễ bị cắt"), vì mỗi nền tảng cắt theo bề rộng hiển thị chứ không theo số ký tự.
 *
 * Chữ hiển thị lấy qua YTX_I18N (src/shared/i18n.js phải nạp trước tệp này), khoá bắt đầu bằng "chk_".
 */
(() => {
  'use strict';
  const { t, tn, num } = globalThis.YTX_I18N;

  const PLATFORMS = Object.freeze([
    { id: 'facebook', name: 'Facebook' },
    { id: 'zalo', name: 'Zalo' },
    { id: 'x', name: 'X (Twitter)' },
    { id: 'linkedin', name: 'LinkedIn' },
    { id: 'discord', name: 'Discord' },
    { id: 'telegram', name: 'Telegram' },
    { id: 'google', name: 'Google' },
  ]);
  const SOCIAL = ['facebook', 'zalo', 'x', 'linkedin', 'discord', 'telegram'];
  const OG = ['facebook', 'zalo', 'linkedin', 'discord', 'telegram'];
  const ALL = [...SOCIAL, 'google'];

  const GROUPS = Object.freeze([
    { id: 'access', name: t('chk_group_access') },
    { id: 'og', name: 'Open Graph (Facebook, Zalo, LinkedIn, Discord, Telegram)' },
    { id: 'image', name: t('chk_group_image') },
    { id: 'x', name: 'X (Twitter)' },
    { id: 'seo', name: t('chk_group_seo') },
  ]);

  const len = (s) => [...(s || '')].length;
  const isAbs = (u) => /^https?:\/\//i.test(u || '');
  // Địa chỉ đầy đủ, chỉ nhận http(s): giá trị javascript:, data:… do trang khai báo không bao giờ được dùng lại.
  const resolve = (u, base) => {
    if (!u) return '';
    try {
      const x = new URL(u, base);
      return /^https?:$/.test(x.protocol) ? x.href : '';
    } catch (_) {
      return '';
    }
  };
  const host = (u) => {
    try { return new URL(u).hostname.replace(/^www\./, ''); } catch (_) { return ''; }
  };
  const fmtBytes = (n) => (n >= 1048576 ? t('chk_bytes_mb', num(n / 1048576, { maximumFractionDigits: 1 }))
    : t('chk_bytes_kb', num(Math.max(1, Math.round(n / 1024)))));
  const short = (s, n = 80) => (len(s) > n ? `${[...s].slice(0, n).join('')}…` : s);
  // Giá trị lấy từ trang, đặt trong ngoặc kép theo ngôn ngữ («…» / “…”).
  const q = (s) => t('chk_quoted', s);

  // Các khoá được so giữa HTML gốc và trang đang hiển thị.
  const TRACKED_META = /^(og:|twitter:|description$|robots$|theme-color$)/;

  /** Gom dữ liệu thô của extractHead thành các trường dễ dùng. `pageUrl`: địa chỉ cuối (sau chuyển hướng). */
  function buildModel(head, pageUrl) {
    const all = new Map();
    for (const m of head.metas) {
      if (!all.has(m.key)) all.set(m.key, []);
      all.get(m.key).push(m.value);
    }
    const values = (k) => (all.get(k) || []).filter(Boolean);
    const get = (...keys) => {
      for (const k of keys) { const v = values(k)[0]; if (v) return v; }
      return '';
    };
    const base = resolve(head.base, pageUrl) || pageUrl;
    const links = head.links.map((l) => ({ ...l, rels: l.rel.split(/\s+/) }));
    const canonical = (links.find((l) => l.rels.includes('canonical')) || {}).href || '';
    const icons = links.filter((l) => l.rels.includes('icon') || l.rels.includes('apple-touch-icon'));
    const icon = icons.find((l) => l.rels.includes('icon')) || icons[0];

    const ogImage = get('og:image', 'og:image:url', 'og:image:secure_url');
    const twImage = get('twitter:image', 'twitter:image:src');
    return {
      head, pageUrl, base, all, values, get,
      title: (head.title || '').replace(/\s+/g, ' ').trim(),
      description: get('description'),
      canonical, canonicalAbs: resolve(canonical, base),
      lang: head.lang,
      robots: [get('robots'), get('googlebot')].filter(Boolean).join(', '),
      viewport: get('viewport'),
      themeColor: get('theme-color'),
      favicon: icon ? icon.href : '', faviconAbs: icon ? resolve(icon.href, base) : '',
      og: {
        title: get('og:title'), description: get('og:description'),
        image: ogImage, imageAbs: resolve(ogImage, base),
        imageWidth: get('og:image:width'), imageHeight: get('og:image:height'), imageAlt: get('og:image:alt'),
        url: get('og:url'), urlAbs: resolve(get('og:url'), base),
        type: get('og:type'), siteName: get('og:site_name'), locale: get('og:locale'),
      },
      tw: {
        card: get('twitter:card').toLowerCase(), title: get('twitter:title'), description: get('twitter:description'),
        image: twImage, imageAbs: resolve(twImage, base), imageAlt: get('twitter:image:alt'),
        site: get('twitter:site'), creator: get('twitter:creator'),
      },
      jsonLd: head.jsonLd || [],
      h1Count: head.h1Count, h1: head.h1,
    };
  }

  /** Những gì mỗi nền tảng sẽ hiện (theo thứ tự lấy thay thế khi thiếu thẻ). */
  function views(m) {
    const domain = host(m.og.urlAbs || m.pageUrl) || host(m.pageUrl);
    const ogTitle = m.og.title || m.title;
    const ogDesc = m.og.description || m.description;
    return {
      domain,
      facebook: { title: ogTitle, desc: ogDesc, image: m.og.imageAbs },
      zalo: { title: ogTitle, desc: ogDesc, image: m.og.imageAbs },
      linkedin: { title: ogTitle, desc: ogDesc, image: m.og.imageAbs },
      x: {
        card: m.tw.card || 'summary',
        title: m.tw.title || m.og.title || m.title,
        desc: m.tw.description || m.og.description,
        image: m.tw.imageAbs || m.og.imageAbs,
      },
      discord: {
        site: m.og.siteName, title: m.og.title || m.tw.title || m.title, desc: m.og.description || m.tw.description || m.description,
        image: m.og.imageAbs || m.tw.imageAbs, large: m.tw.card === 'summary_large_image', color: m.themeColor,
      },
      telegram: { site: m.og.siteName || domain, title: ogTitle, desc: ogDesc, image: m.og.imageAbs || m.tw.imageAbs },
      google: {
        site: m.og.siteName || domain, url: m.canonicalAbs || m.pageUrl, title: m.title || m.og.title,
        desc: m.description, favicon: m.faviconAbs,
      },
    };
  }

  /** Thẻ có giá trị (khoá → giá trị đầu) để so HTML gốc với trang đang hiển thị. */
  function trackedTags(model) {
    const map = new Map();
    for (const [k, vals] of model.all) {
      const v = vals.find(Boolean);
      if (v && TRACKED_META.test(k)) map.set(k, v);
    }
    if (model.title) map.set('<title>', model.title);
    if (model.canonical) map.set('canonical', model.canonical);
    return map;
  }

  /**
   * Chạy mọi quy tắc. ctx = { model, raw, domModel, images: Map(url → info), favicon: info|null, pagePrivate }.
   * Trả về danh sách mục: { id, group, status: pass|warn|fail|info, weight, platforms, title, detail, fix }.
   */
  function runChecks(ctx) {
    const { model: m, raw, domModel, images } = ctx;
    const out = [];
    const add = (group, id, weight, platforms, status, title, detail = '', fix = '') => {
      out.push({ group, id, weight, platforms, status, title, detail, fix });
    };

    // ---- Máy quét đọc được trang -------------------------------------------------------------------
    // Máy quét không đọc được trang thì các thẻ khác dù đúng cũng không hiện: điểm tối đa 49 (Kém).
    const crawlerBlocked = !(raw.ok && raw.head && raw.isHtml);
    if (!crawlerBlocked) {
      const bits = [`HTTP ${raw.status}`, fmtBytes(raw.size || 0), raw.charset ? raw.charset.toUpperCase() : ''].filter(Boolean);
      add('access', 'raw', 3, ALL, 'pass', t('chk_raw_ok'), bits.join(' · ')
        + (raw.redirected ? ` · ${t('chk_raw_redirected', raw.url)}` : ''));
    } else if (raw.ok) {
      add('access', 'raw', 3, ALL, 'fail', t('chk_raw_not_html'),
        raw.contentType ? t('chk_received', raw.contentType) : t('chk_received_empty'), t('chk_raw_not_html_fix'));
    } else if (raw.status) {
      add('access', 'raw', 3, ALL, 'fail', t('chk_raw_status', raw.status),
        t('chk_raw_status_detail'),
        t('chk_raw_status_fix'));
    } else {
      add('access', 'raw', 3, ALL, 'fail', t('chk_raw_failed'), raw.error || '',
        t('chk_raw_failed_fix'));
    }
    if (crawlerBlocked) out[out.length - 1].cap = 49;
    if (raw.truncated) add('access', 'raw-size', 1, ALL, 'warn', t('chk_raw_size'), t('chk_raw_size_detail'), t('chk_raw_size_fix'));

    if (domModel && raw.head) {
      const rawTags = trackedTags(m);
      const domTags = trackedTags(domModel);
      const jsOnly = [...domTags.keys()].filter((k) => !rawTags.has(k));
      const changed = [...domTags.keys()].filter((k) => rawTags.has(k) && rawTags.get(k) !== domTags.get(k)
        && !(k === 'canonical' && resolve(rawTags.get(k), m.base) === resolve(domTags.get(k), domModel.base)));
      const important = jsOnly.filter((k) => /^(og:|twitter:|description$|<title>$)/.test(k));
      if (important.length) {
        add('access', 'js-only', 3, SOCIAL, 'fail', tn('chk_js_only', important.length),
          important.join(', '),
          t('chk_js_only_fix'));
      } else {
        add('access', 'js-only', 3, SOCIAL, 'pass', t('chk_js_only_ok'),
          jsOnly.length ? t('chk_js_only_ok_detail', jsOnly.join(', ')) : '');
      }
      if (changed.length) {
        add('access', 'changed', 1, SOCIAL, 'warn', t('chk_changed'),
          changed.slice(0, 6).map((k) => t('chk_changed_line', k, short(rawTags.get(k), 50), short(domTags.get(k), 50))).join('\n'),
          t('chk_changed_fix'));
      }
    }

    // ---- Open Graph ---------------------------------------------------------------------------------
    const titleLen = len(m.og.title);
    if (!m.og.title) {
      add('og', 'og-title', 3, OG, m.title ? 'warn' : 'fail', t('chk_og_title_missing'),
        m.title ? t('chk_og_title_missing_fallback', short(m.title)) : t('chk_og_title_missing_no_title'),
        t('chk_og_title_missing_fix'));
    } else if (titleLen > 70) {
      add('og', 'og-title', 3, OG, 'warn', tn('chk_og_title_long', titleLen), q(short(m.og.title, 120)), t('chk_og_title_long_fix'));
    } else if (titleLen < 10) {
      add('og', 'og-title', 3, OG, 'warn', tn('chk_og_title_short', titleLen), q(m.og.title), t('chk_og_title_short_fix'));
    } else {
      add('og', 'og-title', 3, OG, 'pass', tn('chk_og_title_ok', titleLen), q(m.og.title));
    }

    const descLen = len(m.og.description);
    if (!m.og.description) {
      add('og', 'og-desc', 2, OG, m.description ? 'warn' : 'fail', t('chk_og_desc_missing'),
        m.description ? t('chk_og_desc_missing_fallback') : t('chk_og_desc_missing_no_desc'),
        t('chk_og_desc_missing_fix'));
    } else if (descLen > 200) {
      add('og', 'og-desc', 2, OG, 'warn', tn('chk_og_desc_long', descLen), t('chk_og_desc_long_detail'), t('chk_og_desc_long_fix'));
    } else if (descLen < 40) {
      add('og', 'og-desc', 2, OG, 'warn', tn('chk_og_desc_short', descLen), q(m.og.description), t('chk_og_desc_short_fix'));
    } else {
      add('og', 'og-desc', 2, OG, 'pass', tn('chk_og_desc_ok', descLen), q(short(m.og.description, 160)));
    }

    if (!m.og.url) {
      add('og', 'og-url', 1, OG, 'warn', t('chk_og_url_missing'), t('chk_og_url_missing_detail'), t('chk_og_url_missing_fix'));
    } else if (!isAbs(m.og.url)) {
      add('og', 'og-url', 1, OG, 'warn', t('chk_og_url_relative'), q(m.og.url), t('chk_og_url_relative_fix'));
    } else if (m.canonicalAbs && normUrl(m.og.urlAbs) !== normUrl(m.canonicalAbs)) {
      add('og', 'og-url', 1, OG, 'warn', t('chk_og_url_mismatch'), `og:url: ${m.og.urlAbs}\ncanonical: ${m.canonicalAbs}`, t('chk_og_url_mismatch_fix'));
    } else {
      add('og', 'og-url', 1, OG, 'pass', t('chk_og_url_ok'), m.og.urlAbs);
    }

    add('og', 'og-type', 0.5, OG, m.og.type ? 'pass' : 'warn', m.og.type ? `og:type = ${m.og.type}` : t('chk_og_type_missing'),
      m.og.type ? '' : t('chk_og_type_missing_detail'), m.og.type ? '' : t('chk_og_type_missing_fix'));
    add('og', 'og-site', 1, ['discord', 'telegram', 'google'], m.og.siteName ? 'pass' : 'warn',
      m.og.siteName ? `og:site_name = ${m.og.siteName}` : t('chk_og_site_missing'),
      m.og.siteName ? '' : t('chk_og_site_missing_detail'),
      m.og.siteName ? '' : t('chk_og_site_missing_fix'));
    add('og', 'og-locale', 0, OG, 'info', m.og.locale ? `og:locale = ${m.og.locale}` : t('chk_og_locale_missing'),
      m.og.locale ? '' : /^vi\b/i.test(m.lang) ? t('chk_og_locale_missing_vi') : t('chk_og_locale_optional'));

    const dups = ['og:title', 'og:description', 'og:url', 'og:type', 'og:site_name', 'twitter:card', 'twitter:title', 'description']
      .filter((k) => new Set(m.values(k)).size > 1);
    if (dups.length) {
      add('og', 'dup', 1, ALL, 'warn', t('chk_dup', dups.join(', ')),
        dups.map((k) => `${k}: ${m.values(k).map((v) => q(short(v, 40))).join(' / ')}`).join('\n'),
        t('chk_dup_fix'));
    }

    // ---- Ảnh chia sẻ ---------------------------------------------------------------------------------
    const IMG = [...OG, 'x'];
    if (!m.og.image) {
      add('image', 'og-image', 4, IMG, 'fail', t('chk_og_image_missing'),
        m.tw.image ? t('chk_og_image_missing_tw') : t('chk_og_image_missing_detail'),
        t('chk_og_image_missing_fix'));
    } else {
      add('image', 'og-image', 4, IMG, 'pass', t('chk_og_image_ok'), m.og.imageAbs || m.og.image);
      if (/^\/\//.test(m.og.image)) {
        add('image', 'img-abs', 2, IMG, 'warn', t('chk_img_abs_scheme'), q(m.og.image), t('chk_img_abs_scheme_fix'));
      } else if (!isAbs(m.og.image)) {
        add('image', 'img-abs', 2, IMG, 'fail', t('chk_img_abs_relative'), t('chk_img_abs_relative_detail', short(m.og.image)), t('chk_img_abs_relative_fix', m.og.imageAbs || 'https://…'));
      } else {
        add('image', 'img-abs', 2, IMG, 'pass', t('chk_img_abs_ok'));
      }
      if (/^http:/i.test(m.og.imageAbs)) add('image', 'img-https', 1, IMG, 'warn', t('chk_img_https'), '', t('chk_img_https_fix'));
      imageChecks(add, images.get(m.og.imageAbs), m, IMG);
    }
    if (m.tw.imageAbs && m.tw.imageAbs !== m.og.imageAbs) {
      const info = images.get(m.tw.imageAbs);
      const okImg = info && info.ok && !info.error;
      add('image', 'tw-image', 1, ['x', 'discord'], okImg ? 'pass' : 'fail', okImg ? t('chk_tw_image_ok') : t('chk_tw_image_failed'),
        okImg ? `${info.width || '?'}×${info.height || '?'} · ${fmtBytes(info.size || 0)}` : (info && info.error) || '', okImg ? '' : t('chk_tw_image_failed_fix'));
    }

    // ---- X (Twitter) ---------------------------------------------------------------------------------
    const CARDS = ['summary', 'summary_large_image', 'app', 'player'];
    if (!m.tw.card) {
      add('x', 'tw-card', 2, ['x'], 'warn', t('chk_tw_card_missing'), t('chk_tw_card_missing_detail'), t('chk_tw_card_missing_fix'));
    } else if (!CARDS.includes(m.tw.card)) {
      add('x', 'tw-card', 2, ['x'], 'fail', t('chk_tw_card_invalid', m.tw.card), t('chk_tw_card_invalid_detail', CARDS.join(', ')), t('chk_tw_card_invalid_fix'));
    } else {
      add('x', 'tw-card', 2, ['x'], 'pass', `twitter:card = ${m.tw.card}`,
        m.tw.card === 'summary' ? t('chk_tw_card_summary') : '');
    }
    const fallbacks = ['title', 'description', 'image'].filter((k) => !m.tw[k]);
    if (fallbacks.length) {
      add('x', 'tw-fallback', 0, ['x'], 'info', t('chk_tw_fallback', `twitter:${fallbacks.join(' / twitter:')}`), t('chk_tw_fallback_detail'));
    }
    if (m.tw.site) add('x', 'tw-site', 0, ['x'], 'info', `twitter:site = ${m.tw.site}`);

    // ---- Google & SEO cơ bản -------------------------------------------------------------------------
    const tLen = len(m.title);
    if (!m.title) add('seo', 'title', 3, ['google'], 'fail', t('chk_title_missing'), '', t('chk_title_missing_fix'));
    else if (tLen > 60) add('seo', 'title', 3, ['google'], 'warn', tn('chk_title_long', tLen), q(short(m.title, 120)), t('chk_title_long_fix'));
    else if (tLen < 30) add('seo', 'title', 3, ['google'], 'warn', tn('chk_title_short', tLen), q(m.title), t('chk_title_short_fix'));
    else add('seo', 'title', 3, ['google'], 'pass', tn('chk_title_ok', tLen), q(m.title));

    const dLen = len(m.description);
    if (!m.description) add('seo', 'desc', 2, ['google'], 'fail', t('chk_desc_missing'), t('chk_desc_missing_detail'), t('chk_desc_missing_fix'));
    else if (dLen > 160) add('seo', 'desc', 2, ['google'], 'warn', tn('chk_desc_long', dLen), t('chk_desc_long_detail'), t('chk_desc_long_fix'));
    else if (dLen < 70) add('seo', 'desc', 2, ['google'], 'warn', tn('chk_desc_short', dLen), q(m.description), t('chk_desc_short_fix'));
    else add('seo', 'desc', 2, ['google'], 'pass', tn('chk_desc_ok', dLen), q(short(m.description, 160)));

    if (!m.canonical) add('seo', 'canonical', 1, ['google'], 'warn', t('chk_canonical_missing'), t('chk_canonical_missing_detail'), t('chk_canonical_missing_fix'));
    else if (!isAbs(m.canonical)) add('seo', 'canonical', 1, ['google'], 'warn', t('chk_canonical_relative'), q(short(m.canonical)), t('chk_canonical_relative_fix', m.canonicalAbs || 'https://…'));
    else add('seo', 'canonical', 1, ['google'], 'pass', t('chk_canonical_ok'), m.canonicalAbs);

    const noindex = /noindex/i.test(m.robots) || /noindex/i.test(raw.xRobots || '');
    add('seo', 'robots', 2, ['google'], noindex ? 'warn' : 'pass', noindex ? t('chk_robots_noindex') : t('chk_robots_ok'),
      noindex ? [m.robots && `meta robots: ${m.robots}`, raw.xRobots && `X-Robots-Tag: ${raw.xRobots}`].filter(Boolean).join('\n') : '',
      noindex ? t('chk_robots_noindex_fix') : '');

    add('seo', 'lang', 1, ['google'], m.lang ? 'pass' : 'warn', m.lang ? t('chk_lang_ok', m.lang) : t('chk_lang_missing'),
      '', m.lang ? '' : t('chk_lang_missing_fix'));
    add('seo', 'viewport', 1, ['google'], m.viewport ? 'pass' : 'warn', m.viewport ? t('chk_viewport_ok') : t('chk_viewport_missing'),
      '', m.viewport ? '' : t('chk_viewport_missing_fix'));

    const favOk = !!(ctx.favicon && ctx.favicon.ok);
    if (m.favicon) {
      add('seo', 'favicon', 1, ['google'], favOk ? 'pass' : 'warn', favOk ? t('chk_favicon_ok') : t('chk_favicon_failed'),
        favOk ? m.faviconAbs : (ctx.favicon && ctx.favicon.error) || m.faviconAbs, favOk ? '' : t('chk_favicon_failed_fix'));
    } else {
      add('seo', 'favicon', 1, ['google'], favOk ? 'pass' : 'warn', favOk ? t('chk_favicon_ico') : t('chk_favicon_missing'),
        favOk ? t('chk_favicon_ico_detail') : t('chk_favicon_missing_detail'),
        favOk ? '' : t('chk_favicon_missing_fix'));
    }

    const h1Count = domModel ? domModel.h1Count : m.h1Count;
    const h1 = domModel ? domModel.h1 : m.h1;
    add('seo', 'h1', 1, ['google'], h1Count ? 'pass' : 'warn', h1Count ? tn('chk_h1_count', h1Count) : t('chk_h1_missing'),
      h1 ? q(short(h1)) : '', h1Count ? '' : t('chk_h1_missing_fix'));

    const types = [...new Set(m.jsonLd.length ? m.jsonLd : (domModel ? domModel.jsonLd : []))];
    add('seo', 'jsonld', 0.5, ['google'], types.length ? 'pass' : 'warn', types.length ? t('chk_jsonld_ok') : t('chk_jsonld_missing'),
      types.length ? types.slice(0, 8).join(', ') : t('chk_jsonld_missing_detail'),
      types.length ? '' : t('chk_jsonld_missing_fix'));

    return out;
  }

  function imageChecks(add, info, m, IMG) {
    if (!info) return;
    if (info.blocked || info.error) {
      add('image', 'img-load', 3, IMG, 'fail', t('chk_img_load_failed'), info.error, t('chk_img_load_failed_fix'));
      return;
    }
    const size = info.size || 0;
    if (info.tooLarge) {
      add('image', 'img-load', 3, IMG, 'pass', t('chk_img_load_ok'));
      add('image', 'img-bytes', 2, IMG, 'fail', t('chk_img_too_large'), '', t('chk_img_too_large_fix'));
      return;
    }
    add('image', 'img-load', 3, IMG, 'pass', t('chk_img_load_ok'),
      [info.type && info.type.replace('image/', '').toUpperCase(), fmtBytes(size), info.redirected ? t('chk_img_redirected') : ''].filter(Boolean).join(' · '));

    const type = info.type || '';
    const fmt = type.replace('image/', '').toUpperCase();
    if (type === 'image/svg+xml') add('image', 'img-format', 2, IMG, 'fail', t('chk_img_svg'), t('chk_img_svg_detail'), t('chk_img_svg_fix'));
    else if (!type && /^image\//.test(info.contentType || '')) add('image', 'img-format', 2, IMG, 'warn', t('chk_img_format_unknown'), t('chk_img_format_unknown_detail', info.contentType), t('chk_img_use_jpg_png'));
    else if (!/^image\//.test(type)) add('image', 'img-format', 2, IMG, 'fail', t('chk_img_not_image'), info.contentType ? t('chk_received', info.contentType) : t('chk_received_unknown'), t('chk_img_not_image_fix'));
    else if (info.decodeError) add('image', 'img-format', 2, IMG, 'fail', t('chk_img_corrupt'), type, t('chk_img_corrupt_fix'));
    else if (/jpeg|png|gif|webp/.test(type)) add('image', 'img-format', 2, IMG, 'pass', t('chk_img_format_ok', fmt));
    else add('image', 'img-format', 2, IMG, 'warn', t('chk_img_format_partial', fmt), '', t('chk_img_use_jpg_png'));

    if (size > 8 * 1048576) add('image', 'img-bytes', 2, IMG, 'fail', t('chk_img_bytes_fb', fmtBytes(size)), '', t('chk_img_compress'));
    else if (size > 5 * 1048576) add('image', 'img-bytes', 2, IMG, 'warn', t('chk_img_bytes_x', fmtBytes(size)), '', t('chk_img_compress'));
    else if (size > 1048576) add('image', 'img-bytes', 2, IMG, 'warn', t('chk_img_bytes_heavy', fmtBytes(size)), t('chk_img_bytes_heavy_detail'), t('chk_img_bytes_heavy_fix'));
    else add('image', 'img-bytes', 2, IMG, 'pass', t('chk_img_bytes_ok', fmtBytes(size)));

    const { width: w, height: h } = info;
    if (!w || !h) return;
    // Kích thước điểm ảnh truyền nguyên số (không định dạng theo ngôn ngữ, tránh "1.200×630").
    if (w >= 1200 && h >= 630) add('image', 'img-dim', 3, IMG, 'pass', t('chk_img_dim_ok', w, h), t('chk_img_dim_ok_detail'));
    else if (w >= 600 && h >= 315) add('image', 'img-dim', 3, IMG, 'warn', t('chk_img_dim_low', w, h), t('chk_img_dim_low_detail'), t('chk_img_dim_low_fix'));
    else if (w >= 200 && h >= 200) add('image', 'img-dim', 3, IMG, 'warn', t('chk_img_dim_small', w, h), t('chk_img_dim_small_detail'), t('chk_img_use_1200'));
    else add('image', 'img-dim', 3, IMG, 'fail', t('chk_img_dim_tiny', w, h), t('chk_img_dim_tiny_detail'), t('chk_img_use_1200'));

    const ratio = w / h;
    const r = num(ratio, { maximumFractionDigits: 2 });
    add('image', 'img-ratio', 1, IMG, Math.abs(ratio - 1.91) <= 0.12 ? 'pass' : 'warn', t('chk_img_ratio', r),
      Math.abs(ratio - 1.91) <= 0.12 ? t('chk_img_ratio_ok') : t('chk_img_ratio_off'),
      Math.abs(ratio - 1.91) <= 0.12 ? '' : t('chk_img_ratio_fix'));

    const dw = parseInt(m.og.imageWidth, 10);
    const dh = parseInt(m.og.imageHeight, 10);
    if (!dw || !dh) {
      add('image', 'img-declared', 1, ['facebook', 'zalo'], 'warn', t('chk_img_declared_missing'),
        t('chk_img_declared_missing_detail'),
        t('chk_img_declared_missing_fix', w, h));
    } else if (dw !== w || dh !== h) {
      add('image', 'img-declared', 1, ['facebook', 'zalo'], 'warn', t('chk_img_declared_mismatch'), t('chk_img_declared_mismatch_detail', dw, dh, w, h), t('chk_img_declared_mismatch_fix', w, h));
    } else {
      add('image', 'img-declared', 1, ['facebook', 'zalo'], 'pass', t('chk_img_declared_ok'));
    }
    const alt = m.og.imageAlt || m.tw.imageAlt;
    add('image', 'img-alt', 0.5, IMG, alt ? 'pass' : 'warn', alt ? t('chk_img_alt_ok') : t('chk_img_alt_missing'),
      alt ? q(short(alt)) : t('chk_img_alt_missing_detail'), alt ? '' : t('chk_img_alt_missing_fix'));
  }

  function normUrl(u) {
    try {
      const x = new URL(u);
      x.hash = '';
      return `${x.protocol}//${x.hostname.toLowerCase()}${x.port ? `:${x.port}` : ''}${x.pathname.replace(/\/+$/, '')}${x.search}`;
    } catch (_) {
      return u;
    }
  }

  /** Điểm 0–100: đạt = trọn trọng số, cần chỉnh = một nửa, lỗi = 0; mục thông tin không tính. */
  function score(checks) {
    let got = 0;
    let total = 0;
    for (const c of checks) {
      if (c.status === 'info' || !c.weight) continue;
      total += c.weight;
      got += c.weight * (c.status === 'pass' ? 1 : c.status === 'warn' ? 0.5 : 0);
    }
    const caps = checks.filter((c) => c.cap != null && c.status === 'fail').map((c) => c.cap);
    const value = Math.min(total ? Math.round((got / total) * 100) : 0, ...caps);
    const grade = value >= 90 ? { id: 'great', name: t('chk_grade_great') } : value >= 75 ? { id: 'good', name: t('chk_grade_good') }
      : value >= 50 ? { id: 'fair', name: t('chk_grade_fair') } : { id: 'poor', name: t('chk_grade_poor') };
    return { value, grade };
  }

  /** Trạng thái từng nền tảng = mục tệ nhất có liên quan. */
  function platformStatus(checks) {
    const rank = { pass: 0, warn: 1, fail: 2 };
    const res = {};
    for (const p of PLATFORMS) {
      const related = checks.filter((c) => c.status !== 'info' && c.platforms.includes(p.id));
      const worst = related.reduce((w, c) => (rank[c.status] > rank[w] ? c.status : w), 'pass');
      res[p.id] = {
        status: worst,
        fails: related.filter((c) => c.status === 'fail').length,
        warns: related.filter((c) => c.status === 'warn').length,
      };
    }
    return res;
  }

  /** Bộ thẻ gợi ý (giữ giá trị đang có, thêm phần thiếu). Mỗi dòng: { text, state: keep | add | fix | note }. */
  function suggestTags(m, images) {
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const lines = [];
    const meta = (attr, key, value, state) => lines.push({ text: `<meta ${attr}="${key}" content="${esc(value)}">`, state });
    const note = (text) => lines.push({ text: `<!-- ${text} -->`, state: 'note' });
    const pageUrl = (() => {
      try {
        const u = new URL(m.pageUrl);
        u.hash = '';
        for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$|zarsrc$)/i.test(k)) u.searchParams.delete(k);
        return u.href;
      } catch (_) {
        return m.pageUrl;
      }
    })();
    const canonical = isAbs(m.canonical) ? m.canonical : m.canonicalAbs || pageUrl;
    const title = m.og.title || m.title || t('chk_suggest_title_placeholder');
    const desc = m.og.description || m.description || t('chk_suggest_desc_placeholder');
    const info = images.get(m.og.imageAbs);
    const image = isAbs(m.og.image) ? m.og.image : m.og.imageAbs || t('chk_suggest_image_url', host(m.pageUrl) || t('chk_suggest_domain_placeholder'));
    const domain = host(m.pageUrl);
    const locale = m.og.locale || ({ vi: 'vi_VN', en: 'en_US' }[(m.lang || '').slice(0, 2).toLowerCase()] || '');

    note(t('chk_suggest_note_basic'));
    lines.push({ text: `<title>${esc(m.title || title)}</title>`, state: m.title ? 'keep' : 'add' });
    meta('name', 'description', m.description || desc, m.description ? 'keep' : 'add');
    lines.push({ text: `<link rel="canonical" href="${esc(canonical)}">`, state: isAbs(m.canonical) ? 'keep' : m.canonical ? 'fix' : 'add' });
    note('Open Graph (Facebook, Zalo, LinkedIn, Discord, Telegram…)');
    meta('property', 'og:type', m.og.type || 'website', m.og.type ? 'keep' : 'add');
    meta('property', 'og:url', isAbs(m.og.url) ? m.og.url : canonical, isAbs(m.og.url) ? 'keep' : m.og.url ? 'fix' : 'add');
    meta('property', 'og:title', title, m.og.title ? 'keep' : 'add');
    meta('property', 'og:description', desc, m.og.description ? 'keep' : 'add');
    meta('property', 'og:image', image, isAbs(m.og.image) ? 'keep' : m.og.image ? 'fix' : 'add');
    const w = (info && info.width) || 1200;
    const h = (info && info.height) || 630;
    const declaredOk = +m.og.imageWidth === w && +m.og.imageHeight === h;
    meta('property', 'og:image:width', w, declaredOk ? 'keep' : m.og.imageWidth ? 'fix' : 'add');
    meta('property', 'og:image:height', h, declaredOk ? 'keep' : m.og.imageHeight ? 'fix' : 'add');
    meta('property', 'og:image:alt', m.og.imageAlt || m.tw.imageAlt || t('chk_suggest_alt_placeholder'), m.og.imageAlt ? 'keep' : 'add');
    meta('property', 'og:site_name', m.og.siteName || domain || t('chk_suggest_site_placeholder'), m.og.siteName ? 'keep' : 'add');
    if (locale) meta('property', 'og:locale', locale, m.og.locale ? 'keep' : 'add');
    note(t('chk_suggest_note_x'));
    meta('name', 'twitter:card', CARD_OK(m.tw.card) ? m.tw.card : 'summary_large_image', CARD_OK(m.tw.card) ? 'keep' : m.tw.card ? 'fix' : 'add');
    if (m.tw.site) meta('name', 'twitter:site', m.tw.site, 'keep');
    return lines;
  }
  const CARD_OK = (c) => ['summary', 'summary_large_image', 'app', 'player'].includes(c);

  globalThis.SHARE_CHECKS = Object.freeze({
    PLATFORMS, GROUPS, buildModel, views, trackedTags, runChecks, score, platformStatus, suggestTags, fmtBytes, host,
  });
})();
