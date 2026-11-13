/*
 * Popup – thẻ "Âm thanh": danh sách tab đang phát (hoặc đã chỉnh), mỗi tab có thanh âm lượng,
 * nút tắt tiếng, nút cửa sổ nổi; bấm tên tab để chuyển tới tab đó.
 *  - 0–100%: mọi tab (service worker chỉnh âm lượng thẻ <video>/<audio> trong tab).
 *  - Tới 600%: tab đang mở popup (Chrome chỉ cho bắt âm thanh tab mà người dùng vừa mở extension).
 */
(() => {
  'use strict';
  const { createIcon, pipInTab } = globalThis.YTX_SHARED;
  const { t: tr } = globalThis.YTX_I18N; // tr: tránh trùng tên biến t (tab) ở dưới
  const $ = (id) => document.getElementById(id);

  let currentTab = null;
  let started = false;
  let dragging = null;     // id tab đang kéo thanh âm lượng
  let pendingReload = false;
  let setTimer = 0;

  async function send(msg) {
    try {
      return await chrome.runtime.sendMessage(msg);
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  }

  function h(tag, props = {}, children = []) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
    for (const c of [].concat(children)) if (c) el.append(c);
    return el;
  }

  const hostOf = (url) => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch (_) {
      return '';
    }
  };

  function iconBtn(icon, label, onclick, cls = '') {
    return h('button', { class: `icon-btn ${cls}`.trim(), type: 'button', title: label, 'aria-label': label, onclick }, [createIcon(icon)]);
  }

  function paintSlider(input, pct) {
    const max = +input.max;
    input.style.setProperty('--fill', `${(Math.min(pct, max) / max) * 100}%`);
  }

  function row(t) {
    const canBoost = t.captured || t.current;
    const max = canBoost ? 600 : 100;
    const pct = Math.round(t.level * 100);
    const note = h('p', { class: 'mix-note', hidden: true });
    const label = h('span', { class: `mix-pct${pct > 100 ? ' boost' : ''}`, text: `${pct}%` });
    const slider = h('input', {
      type: 'range', min: 0, max, step: 5, value: Math.min(pct, max), 'aria-label': tr('audio_volume_aria', t.title),
      list: canBoost ? 'mix-ticks' : null,
    });
    paintSlider(slider, pct);

    const showNote = (text) => {
      note.textContent = text;
      note.hidden = !text;
    };

    slider.addEventListener('input', () => {
      dragging = t.id;
      const v = +slider.value;
      label.textContent = `${v}%`;
      label.classList.toggle('boost', v > 100);
      paintSlider(slider, v);
      if (v > 100 && !t.captured) return; // tăng quá 100% bắt đầu khi thả chuột
      clearTimeout(setTimer);
      setTimer = setTimeout(() => send({ type: 'vol:set', tabId: t.id, level: v / 100 }), 60);
    });
    slider.addEventListener('change', async () => {
      clearTimeout(setTimer);
      const level = +slider.value / 100;
      let res;
      if (level > 1 && !t.captured) {
        res = await boost(t, level);
      } else {
        res = await send({ type: 'vol:set', tabId: t.id, level });
      }
      dragging = null;
      if (!res || !res.ok) showNote((res && res.error) || tr('audio_set_failed'));
      else Object.assign(t, { level: res.level, captured: res.captured });
      if (pendingReload) load();
    });
    slider.addEventListener('dblclick', async () => {
      await send({ type: 'vol:reset', tabId: t.id });
      load();
    });

    const name = h('button', { class: 'mix-name', type: 'button', title: tr('audio_tab_switch_tip', t.title) }, [
      t.favIconUrl ? h('img', { src: t.favIconUrl, alt: '', width: 16, height: 16, referrerpolicy: 'no-referrer' }) : createIcon('speaker'),
      h('span', { class: 'mix-title', text: t.title || hostOf(t.url) }),
    ]);
    name.addEventListener('click', async () => {
      await send({ type: 'vol:focus', tabId: t.id });
      window.close();
    });
    const img = name.querySelector('img');
    if (img) img.addEventListener('error', () => img.replaceWith(createIcon('speaker')), { once: true });

    const tags = [];
    if (t.current) tags.push(h('span', { class: 'mix-tag', text: tr('audio_this_tab') }));
    if (t.audible && !t.muted) tags.push(h('span', { class: 'mix-live', title: tr('audio_playing') }));

    const pipBtn = iconBtn('pip', tr('audio_pip'), async () => {
      const res = await pipInTab(t.id);
      if (res && res.ok) window.close();
      else showNote((res && res.error) || tr('audio_pip_failed'));
    });
    const muteBtn = iconBtn(t.muted ? 'speakerOff' : 'speaker', t.muted ? tr('audio_unmute') : tr('audio_mute'), async () => {
      await send({ type: 'vol:mute', tabId: t.id, muted: !t.muted });
      load();
    }, t.muted ? 'on' : '');

    return h('li', { class: `mix-row${t.muted ? ' muted' : ''}`, 'data-id': t.id }, [
      h('div', { class: 'mix-top' }, [name, ...tags, pipBtn, muteBtn]),
      h('div', { class: 'mix-bottom' }, [slider, label]),
      note,
    ]);
  }

  /** Tăng quá 100%: lấy streamId của tab (chỉ được với tab đang mở popup) rồi nhờ service worker khuếch đại. */
  async function boost(t, level) {
    let streamId;
    try {
      streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: t.id });
    } catch (err) {
      return { ok: false, error: tr('audio_boost_current_only') };
    }
    return send({ type: 'vol:boost', tabId: t.id, streamId, level });
  }

  function render(tabs) {
    const list = $('mixer');
    list.replaceChildren(...tabs.map(row));
    $('mixerEmpty').hidden = tabs.length > 0;
    const othersPlaying = currentTab && tabs.some((t) => t.audible && !t.muted && t.id !== currentTab.id);
    $('muteOthers').hidden = !othersPlaying;
  }

  async function load() {
    if (dragging != null) {
      pendingReload = true;
      return;
    }
    pendingReload = false;
    const res = await send({ type: 'vol:list', currentTabId: currentTab ? currentTab.id : null });
    render((res && res.tabs) || []);
  }

  async function start() {
    if (started) return;
    started = true;
    [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    // Vạch đánh dấu 100% trên thanh có thể tăng âm.
    document.body.append(h('datalist', { id: 'mix-ticks' }, [h('option', { value: 100 })]));
    $('muteOthers').addEventListener('click', async () => {
      await send({ type: 'vol:muteOthers', tabId: currentTab.id });
      load();
    });
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === 'vol:changed') load();
      return undefined;
    });
    load();
  }

  document.addEventListener('ytx-tab', (e) => {
    if (e.detail === 'tab-audio') start();
  });
  // Thẻ Âm thanh đã được chọn sẵn (lần trước) hoặc được download.js tự chọn.
  setTimeout(() => {
    if (globalThis.POPUP_TABS && globalThis.POPUP_TABS.current() === 'tab-audio') start();
  }, 0);
})();
