/* Popup: điều khiển nhanh + cài đặt. Giao tiếp với content script qua chrome.tabs.sendMessage. */
(() => {
  'use strict';
  const { DEFAULTS, LABELS, SHORTCUTS, createIcon } = globalThis.YTX_SHARED;
  const $ = (id) => document.getElementById(id);

  let settings = { ...DEFAULTS };
  let tabId = null;

  // Thanh trượt: giá trị lưu trữ <-> giá trị trên thanh (phần trăm).
  const RANGES = {
    dim: { toUi: (v) => Math.round(v * 100), fromUi: (v) => v / 100 },
    glowStrength: { toUi: (v) => Math.round(v * 100), fromUi: (v) => v / 100 },
    glowSize: { toUi: (v) => v, fromUi: (v) => v },
  };
  // Bản Store không có ô dlCookies -> chỉ lấy các ô có trong popup.
  const TOGGLES = ['glow', 'keepTransform', 'playerButtons', 'shortcuts', 'dlCookies', 'autoPip'].filter((id) => $(id));

  // ---- Dựng giao diện tĩnh ----------------------------------------------------
  for (const el of document.querySelectorAll('[data-icon]')) el.append(createIcon(el.dataset.icon));
  for (const btn of document.querySelectorAll('#actions button')) {
    btn.querySelector('.lbl').textContent = LABELS[btn.dataset.action].replace(' 90°', '');
    btn.title = LABELS[btn.dataset.action];
  }
  $('version').textContent = `v${chrome.runtime.getManifest().version}`;

  const list = $('shortcutList');
  const keyRows = [
    ...SHORTCUTS.map((s) => [LABELS[s.action], s.key]),
    ['Thoát Rạp phim / bật đèn', 'Esc'],
    ['Cửa sổ nổi (mọi trang)', 'Alt+P'],
    ['Chụp cả trang (mọi trang)', 'Alt+S'],
  ];
  for (const [label, key] of keyRows) {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = label;
    const kbd = document.createElement('kbd');
    kbd.textContent = key;
    li.append(name, kbd);
    list.append(li);
  }

  // ---- Thẻ Điều khiển / Cài đặt ------------------------------------------------
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  function selectTab(tab, remember = true) {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      $(t.getAttribute('aria-controls')).hidden = !on;
    }
    if (remember) {
      try { localStorage.setItem('ytx-tab', tab.id); } catch (_) { /* không bắt buộc */ }
    }
    document.dispatchEvent(new CustomEvent('ytx-tab', { detail: tab.id }));
  }
  // Cho download.js: chọn thẻ / xem thẻ đang mở.
  globalThis.POPUP_TABS = {
    select: (id, remember) => selectTab($(id), remember),
    current: () => (tabs.find((t) => t.getAttribute('aria-selected') === 'true') || tabs[0]).id,
  };
  for (const t of tabs) {
    t.addEventListener('click', () => selectTab(t));
    t.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const next = tabs[(tabs.indexOf(t) + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      selectTab(next);
      next.focus();
    });
  }
  try {
    const saved = $(localStorage.getItem('ytx-tab') || '');
    if (saved && tabs.includes(saved)) selectTab(saved);
  } catch (_) { /* không bắt buộc */ }

  // ---- Cài đặt ------------------------------------------------------------------
  function paintRange(input) {
    const min = +input.min;
    const max = +input.max;
    input.style.setProperty('--fill', `${((+input.value - min) / (max - min)) * 100}%`);
    $(`${input.id}Out`).textContent = `${input.value}%`;
  }

  function renderSettings() {
    for (const [key, conv] of Object.entries(RANGES)) {
      const input = $(key);
      input.value = conv.toUi(settings[key]);
      paintRange(input);
    }
    for (const key of TOGGLES) $(key).checked = !!settings[key];
    $('glowFields').classList.toggle('off', !settings.glow);
    $('glowStrength').disabled = !settings.glow;
    $('glowSize').disabled = !settings.glow;
    $('shortcutCard').classList.toggle('off', !settings.shortcuts);
  }

  function save() {
    chrome.storage.local.set({ settings });
  }

  for (const [key, conv] of Object.entries(RANGES)) {
    $(key).addEventListener('input', (e) => {
      settings[key] = conv.fromUi(+e.target.value);
      paintRange(e.target);
      save();
    });
  }
  for (const key of TOGGLES) {
    $(key).addEventListener('change', (e) => {
      settings[key] = e.target.checked;
      renderSettings();
      save();
    });
  }
  $('resetSettings').addEventListener('click', () => {
    settings = { ...DEFAULTS };
    renderSettings();
    save();
  });

  // ---- Điều khiển tab YouTube đang mở ------------------------------------------
  function send(msg) {
    return new Promise((resolve) => {
      if (tabId == null) return resolve(null);
      chrome.tabs.sendMessage(tabId, msg, (res) => {
        resolve(chrome.runtime.lastError ? null : res);
      });
    });
  }

  function renderState(st) {
    const notice = $('notice');
    const hasVideo = !!(st && st.hasPlayer);
    if (!st) {
      notice.textContent = 'Hãy mở một video YouTube. Vừa cài extension? Tải lại tab YouTube (F5).';
    } else if (!hasVideo || !st.isWatch) {
      notice.textContent = 'Hãy mở một video YouTube để dùng xoay, lật và tắt đèn.';
    }
    notice.hidden = !!(st && hasVideo && st.isWatch);
    // Popup Chrome cao tối đa 600px: khi hiện dòng nhắc (chưa có video) thì ẩn khối phóng to.
    $('zoomCard').hidden = !notice.hidden;

    for (const btn of document.querySelectorAll('#actions button, #zoomActions button')) btn.disabled = !hasVideo;

    const canMode = !!(st && st.isWatch && hasVideo);
    const lights = $('lightsBtn');
    const dark = !!(st && st.lightsOff);
    lights.disabled = !canMode;
    lights.setAttribute('aria-pressed', String(dark));
    $('lightsTitle').textContent = dark ? 'Đang tắt đèn' : 'Tắt đèn';
    $('lightsSub').textContent = dark ? 'Bấm để bật lại' : 'Trang tối, đèn nền';

    const cinema = $('cinemaBtn');
    const cine = !!(st && st.cinema);
    cinema.disabled = !canMode;
    cinema.setAttribute('aria-pressed', String(cine));
    $('cinemaTitle').textContent = cine ? 'Đang Rạp phim' : 'Rạp phim';
    $('cinemaSub').textContent = cine ? 'Bấm để thoát' : 'Tràn kín cửa sổ';

    const t = st ? st.transform : { angle: 0, flipH: false, flipV: false };
    const parts = [`${t.angle}°`];
    if (t.flipH) parts.push('lật ngang');
    if (t.flipV) parts.push('lật dọc');
    $('transformState').textContent = parts.join(' · ');
    document.querySelector('[data-action="flipH"]').classList.toggle('active', t.flipH);
    document.querySelector('[data-action="flipV"]').classList.toggle('active', t.flipV);

    $('zoomState').textContent = `${t.zoom || 100}%`;
    for (const btn of document.querySelectorAll('#zoomActions [data-crop]')) {
      btn.classList.toggle('active', !!t.crop && btn.dataset.crop === t.crop);
    }
  }

  async function onActionClick(e) {
    const btn = e.target.closest('button[data-action]');
    if (!btn || btn.disabled) return;
    renderState(await send({ type: 'ytx:run', action: btn.dataset.action }));
  }
  $('actions').addEventListener('click', onActionClick);
  $('zoomActions').addEventListener('click', onActionClick);

  // ---- Chụp màn hình (thẻ Tiện ích) -----------------------------------------------
  $('shotButtons').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-shot]');
    if (!btn || tabId == null) return;
    const res = await chrome.runtime.sendMessage({ type: 'shot:start', tabId, mode: btn.dataset.shot })
      .catch((err) => ({ ok: false, error: err.message }));
    if (res && res.ok) {
      window.close(); // đóng popup để chụp trang (và để kéo chọn vùng)
      return;
    }
    $('shotErr').textContent = (res && res.error) || 'Không chụp được trang này.';
    $('shotErr').hidden = false;
  });

  // ---- Cửa sổ nổi cho tab đang xem (mọi trang) ------------------------------------
  let pipTimer = 0;
  $('pipBtn').addEventListener('click', async () => {
    if (tabId == null) return;
    const res = await globalThis.YTX_SHARED.pipInTab(tabId);
    if (res && res.ok) {
      window.close(); // đóng popup để thấy cửa sổ nổi
      return;
    }
    const text = $('pipText');
    text.textContent = res && res.reason === 'no-video' ? 'Không có video' : 'Không mở được';
    $('pipBtn').title = (res && res.error) || '';
    clearTimeout(pipTimer);
    pipTimer = setTimeout(() => { text.textContent = 'Cửa sổ nổi'; }, 2500);
  });

  $('lightsBtn').addEventListener('click', async () => {
    renderState(await send({ type: 'ytx:run', action: 'toggleLights' }));
  });

  $('cinemaBtn').addEventListener('click', async () => {
    renderState(await send({ type: 'ytx:run', action: 'toggleCinema' }));
  });

  // ---- Khởi động -------------------------------------------------------------------
  (async () => {
    const stored = await chrome.storage.local.get('settings');
    settings = { ...DEFAULTS, ...(stored.settings || {}) };
    renderSettings();

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tabId = tab ? tab.id : null;
    renderState(await send({ type: 'ytx:getState' }));
  })();
})();
