#!/usr/bin/env node
/*
 * Kiểm tra bản dịch.
 *
 *   node tools/i18n-check.mjs                  -> kiểm tra mã nguồn với _locales/
 *   node tools/i18n-check.mjs --parts <thư mục> -> cộng thêm khoá từ các tệp <vùng>.json (dùng khi đang tách chuỗi)
 *   node tools/i18n-check.mjs --root dist/store -> kiểm tra một bản build
 *   --quiet                                     -> không in cảnh báo (tools/build.mjs dùng)
 *
 * Lỗi (thoát mã 1):
 *   - mã nguồn / HTML / manifest dùng khoá không có trong _locales/en
 *   - các ngôn ngữ không cùng bộ khoá với en, hoặc khác bộ $1…$9
 *   - tên khoá sai quy tắc, '$' đứng một mình (phải viết '$$')
 * Cảnh báo: khoá không dùng tới, còn chữ tiếng Việt ngoài chú thích.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const ROOT = resolve(opt('--root') || join(dirname(fileURLToPath(import.meta.url)), '..'));
const PARTS = opt('--parts');

// Tiền tố khoá theo vùng mã (xem src/shared/i18n.js).
const PREFIX = '(?:full_)?(?:ext|cmd|act|popup|audio|dl|bg|page|yt|share|chk|shot)_[a-z0-9_]+';
const KEY_RE = /^[a-z0-9_]+$/;
const VI = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

const errors = [];
const warnings = [];

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}
const rel = (p) => relative(ROOT, p).split(sep).join('/');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const dollars = (msg) => [...new Set((msg.replace(/\$\$/g, '').match(/\$[1-9]/g) || []))].sort().join(',');

// ---- Khoá đã định nghĩa -------------------------------------------------------------
const LOCALES = join(ROOT, '_locales');
const locales = existsSync(LOCALES) ? readdirSync(LOCALES).filter((d) => existsSync(join(LOCALES, d, 'messages.json'))) : [];
const messages = {};
for (const loc of locales) {
  try {
    messages[loc] = readJson(join(LOCALES, loc, 'messages.json'));
  } catch (e) {
    errors.push(`_locales/${loc}/messages.json: JSON lỗi: ${e.message}`);
    messages[loc] = {};
  }
}
const en = { ...(messages.en || {}) };
if (PARTS) {
  for (const f of walk(resolve(PARTS)).filter((p) => p.endsWith('.json'))) {
    let part;
    try {
      part = readJson(f);
    } catch (e) {
      errors.push(`${f}: JSON lỗi: ${e.message}`);
      continue;
    }
    for (const [k, v] of Object.entries(part)) {
      if (en[k]) errors.push(`${f}: khoá "${k}" trùng với tệp khác`);
      if (!v || typeof v.vi !== 'string' || typeof v.en !== 'string') errors.push(`${f}: khoá "${k}" thiếu "vi" hoặc "en"`);
      else if (dollars(v.vi) !== dollars(v.en)) errors.push(`${f}: khoá "${k}" vi/en khác bộ $n`);
      en[k] = { message: v && v.en };
    }
  }
}
if (!Object.keys(en).length) errors.push('Chưa có khoá nào (_locales/en/messages.json hoặc --parts).');

const lower = new Map();
for (const [k, v] of Object.entries(en)) {
  if (!KEY_RE.test(k)) errors.push(`khoá "${k}": chỉ dùng a-z, 0-9, _`);
  if (lower.has(k.toLowerCase())) errors.push(`khoá "${k}" trùng "${lower.get(k.toLowerCase())}" (chrome.i18n không phân biệt hoa thường)`);
  lower.set(k.toLowerCase(), k);
  if (typeof (v && v.message) !== 'string') errors.push(`khoá "${k}": thiếu message`);
}

// ---- Các ngôn ngữ phải khớp en -----------------------------------------------------------
for (const loc of locales) {
  if (loc === 'en') continue;
  const m = messages[loc];
  for (const k of Object.keys(en)) {
    if (!m[k]) errors.push(`_locales/${loc}: thiếu khoá "${k}"`);
    else if (dollars(m[k].message) !== dollars(en[k].message)) {
      errors.push(`_locales/${loc}: khoá "${k}" có $n (${dollars(m[k].message)}) khác en (${dollars(en[k].message)})`);
    }
  }
  if (PARTS) continue; // khi đang tách chuỗi, en ở --parts có thể nhiều hơn
  for (const k of Object.keys(m)) if (!en[k]) errors.push(`_locales/${loc}: thừa khoá "${k}" (en không có)`);
}
for (const loc of locales) {
  for (const [k, v] of Object.entries(messages[loc])) {
    const msg = (v && v.message) || '';
    if (!msg.trim()) errors.push(`_locales/${loc}: khoá "${k}" rỗng`);
    if (/\$(?![$1-9])/.test(msg.replace(/\$\$/g, ''))) errors.push(`_locales/${loc}: khoá "${k}" có '$' đứng một mình (viết '$$')`);
  }
}

// ---- Khoá được dùng trong mã ------------------------------------------------------------
const used = new Set();
const sources = [
  ...walk(join(ROOT, 'popup')),
  ...walk(join(ROOT, 'src')),
].filter((p) => /\.(js|html)$/.test(p) && rel(p) !== 'src/shared/i18n.js'); // i18n.js là bộ dịch, không chứa khoá
const has = (k) => Boolean(en[k]) || (Boolean(en[`${k}_one`]) && Boolean(en[`${k}_other`]));
function need(k, where) {
  used.add(k);
  if (!has(k)) errors.push(`${where}: khoá "${k}" không có trong en`);
}
for (const file of sources) {
  const text = readFileSync(file, 'utf8');
  const where = rel(file);
  if (file.endsWith('.js')) {
    for (const m of text.matchAll(new RegExp(`(['"\`])(${PREFIX})\\1`, 'g'))) need(m[2], where);
    for (const m of text.matchAll(/\btn\(\s*['"]([a-z0-9_]+)['"]/g)) {
      used.add(`${m[1]}_one`);
      used.add(`${m[1]}_other`);
      if (!en[`${m[1]}_one`] || !en[`${m[1]}_other`]) errors.push(`${where}: tn("${m[1]}") cần cả ${m[1]}_one và ${m[1]}_other`);
    }
    for (const m of text.matchAll(/\b(?:t|tn|rich|getMessage)\(\s*(?!['"])([^)]{0,40})/g)) {
      if (/^\w+\s*\.\s*(i18n|dataset)/.test(m[1])) continue;
      if (!/^(key|k|msg|m|code|id|name|label|labelKey|errKey|item|it|c|r|s|x|e|err|res|row|g|p|f)\b/.test(m[1])) continue;
      warnings.push(`${where}: gọi ${m[0].slice(0, 30)}… với khoá không phải chuỗi cố định (kiểm tra tay)`);
    }
  } else {
    for (const m of text.matchAll(/data-i18n(?:-[a-z-]+)?="([^"]*)"/g)) need(m[1], where);
  }
  // Còn tiếng Việt ngoài chú thích?
  text.split(/\r?\n/).forEach((line, i) => {
    const s = line.trim();
    if (!VI.test(s) || /^(\/\/|\*|\/\*|<!--)/.test(s)) return;
    const code = s.replace(/\s\/\/\s.*$/, '').replace(/\/\*.*?\*\//g, '').replace(/<!--.*?-->/g, '');
    if (VI.test(code) && !/console\.(log|warn|error|info|debug)/.test(code)) warnings.push(`${where}:${i + 1}: còn chữ tiếng Việt: ${s.slice(0, 90)}`);
  });
}
const manifestPath = join(ROOT, 'manifest.json');
if (existsSync(manifestPath)) {
  const mtext = readFileSync(manifestPath, 'utf8');
  for (const m of mtext.matchAll(/__MSG_([A-Za-z0-9_]+)__/g)) need(m[1], 'manifest.json');
  const manifest = JSON.parse(mtext);
  if (/__MSG_/.test(mtext) && !manifest.default_locale) errors.push('manifest.json: dùng __MSG_ nhưng thiếu default_locale');
  if (manifest.default_locale && !locales.includes(manifest.default_locale) && !PARTS) {
    errors.push(`manifest.json: default_locale "${manifest.default_locale}" không có thư mục _locales`);
  }
}
for (const k of Object.keys(en)) {
  if (k === 'locale_code') continue;
  if (!used.has(k)) warnings.push(`khoá "${k}" không thấy dùng ở đâu`);
}

if (!args.includes('--quiet')) for (const w of warnings) console.warn(`cảnh báo: ${w}`);
if (errors.length) {
  console.error(`\nLỖI (${errors.length}):\n  - ${errors.join('\n  - ')}`);
  process.exit(1);
}
console.log(`\nOK: ${Object.keys(en).length} khoá, ${locales.length} ngôn ngữ (${locales.join(', ') || '—'}), ${warnings.length} cảnh báo.`);
