#!/usr/bin/env node
/*
 * Build extension từ mã nguồn.
 *
 *   node tools/build.mjs store         -> dist/store/   (bản Chrome Web Store: không có tải video / âm thanh)
 *   node tools/build.mjs full          -> dist/full/    (bản đầy đủ, giống thư mục gốc, dùng cho bản phát hành trên GitHub)
 *   node tools/build.mjs store --zip   -> thêm dist/cinema-tools-store-v<version>.zip
 *
 * Mã nguồn đánh dấu phần chỉ có ở bản đầy đủ bằng:
 *   JS / CSS:  // #full-start … // #full-end          (cả dòng)
 *              /* #store-start … #store-end *\/        (chỉ có ở bản Store; ở mã nguồn là chú thích)
 *   HTML:      <!-- #full-start --> … <!-- #full-end -->
 *              <!-- #store-start … #store-end -->
 *   _locales:  khoá bắt đầu bằng "full_" chỉ có ở bản đầy đủ (bản Store xoá đi).
 * Thư mục gốc chạy thẳng được (Load unpacked) như bản đầy đủ.
 * Chỉ dùng thư viện có sẵn của Node.js (>= 22), không cần npm install.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [edition, ...flags] = process.argv.slice(2);
if (!['store', 'full'].includes(edition)) {
  console.error('Dùng: node tools/build.mjs <store|full> [--zip]');
  process.exit(2);
}
const ZIP = flags.includes('--zip');

// Bản Store: chỉ các phần của extension. Bản đầy đủ: thêm bộ tải trên máy (không gồm các tệp riêng tư
// config.json, host.bat, com.cinematools.downloader.json, host.log mà install.bat tự tạo) và tài liệu.
const EXTENSION_FILES = ['manifest.json', '_locales', 'icons', 'popup', 'src', 'LICENSE'];
const INCLUDE = {
  store: EXTENSION_FILES,
  full: [
    ...EXTENSION_FILES,
    'native-host/host.py', 'native-host/install.py', 'native-host/install.bat', 'native-host/uninstall.bat',
    'README.md', 'PRIVACY.md',
  ],
}[edition];

// Bản Store: bỏ quyền chỉ dùng cho tải video / âm thanh.
const STORE_DROP_PERMISSIONS = new Set(['nativeMessaging', 'cookies', 'webRequest']);
// Tên / mô tả theo ngôn ngữ: khoá ext_name_store, ext_desc_store trong _locales.
const STORE_MANIFEST = {
  name: '__MSG_ext_name_store__',
  short_name: 'Cinema Tools',
  description: '__MSG_ext_desc_store__',
};
// Bản Store không được còn sót những thứ này (chính sách Store cấm tải video YouTube).
const STORE_FORBIDDEN = [
  /yt-dlp/i, /nativeMessaging/, /connectNative/, /sendNativeMessage/, /chrome\.cookies/, /chrome\.webRequest/,
  /i\.ytimg\.com/, /com\.cinematools\.downloader/, /#full-(start|end)/, /#store-(start|end)/,
];
// Mã / HTML của bản Store không được dùng chuỗi chỉ có ở bản đầy đủ (đã bị xoá khỏi _locales).
const STORE_FORBIDDEN_CODE = [/(['"`])full_[a-z0-9_]+\1/, /data-i18n[a-z-]*="full_/];

const out = join(ROOT, 'dist', edition);

function strip(text, file) {
  const isHtml = file.endsWith('.html');
  const fullBlock = isHtml
    ? /^[ \t]*<!-- #full-start -->[\s\S]*?<!-- #full-end -->[ \t]*\r?\n/gm
    : /^[ \t]*\/[/*] #full-start(?: \*\/)?[\s\S]*?\/[/*] #full-end(?: \*\/)?[ \t]*\r?\n/gm;
  const storeBlock = isHtml
    ? /^([ \t]*)<!-- #store-start\r?\n([\s\S]*?)^[ \t]*#store-end -->[ \t]*\r?\n/gm
    : /^([ \t]*)\/\* #store-start\r?\n([\s\S]*?)^[ \t]*#store-end \*\/[ \t]*\r?\n/gm;
  if (edition === 'store') {
    return text.replace(fullBlock, '').replace(storeBlock, '$2');
  }
  // Bản đầy đủ: giữ khối full (bỏ dòng đánh dấu), bỏ khối chỉ dành cho Store.
  const markerLine = isHtml
    ? /^[ \t]*<!-- #full-(start|end) -->[ \t]*\r?\n/gm
    : /^[ \t]*\/[/*] #full-(start|end)(?: \*\/)?[ \t]*\r?\n/gm;
  return text.replace(storeBlock, '').replace(markerLine, '');
}

function walk(dir) {
  const files = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files.push(...walk(p));
    else files.push(p);
  }
  return files;
}

// ---- Sao chép + xử lý -------------------------------------------------------------------
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const item of INCLUDE) {
  const src = join(ROOT, item);
  if (existsSync(src)) cpSync(src, join(out, item), { recursive: true });
}

const problems = [];
for (const file of walk(out)) {
  const rel = relative(out, file).split(sep).join('/');
  if (!/\.(js|html|css)$/.test(rel)) continue;
  const before = readFileSync(file, 'utf8');
  const after = strip(before, rel);
  if (after !== before) writeFileSync(file, after);
  if (edition === 'store') {
    for (const re of [...STORE_FORBIDDEN, ...STORE_FORBIDDEN_CODE]) if (re.test(after)) problems.push(`${rel}: còn "${re.source}"`);
  }
}

const manifestPath = join(out, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (edition === 'store') {
  Object.assign(manifest, STORE_MANIFEST);
  manifest.permissions = manifest.permissions.filter((p) => !STORE_DROP_PERMISSIONS.has(p));
  const text = JSON.stringify(manifest);
  for (const re of STORE_FORBIDDEN) if (re.test(text)) problems.push(`manifest.json: còn "${re.source}"`);
}
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

// ---- Bản dịch (_locales) -------------------------------------------------------------------
const localesDir = join(out, '_locales');
const locales = existsSync(localesDir) ? readdirSync(localesDir).sort() : [];
if (manifest.default_locale && !locales.includes(manifest.default_locale)) {
  problems.push(`thiếu _locales/${manifest.default_locale} (default_locale)`);
}
const catalogs = {};
for (const loc of locales) {
  const p = join(localesDir, loc, 'messages.json');
  const messages = JSON.parse(readFileSync(p, 'utf8'));
  if (edition === 'store') {
    for (const key of Object.keys(messages)) if (key.startsWith('full_')) delete messages[key];
    const json = JSON.stringify(messages);
    for (const re of STORE_FORBIDDEN) if (re.test(json)) problems.push(`_locales/${loc}: còn "${re.source}"`);
    writeFileSync(p, `${JSON.stringify(messages, null, 2)}\n`);
  }
  catalogs[loc] = messages;
}
// Giới hạn của Chrome / Cửa hàng áp cho chữ thật của từng ngôn ngữ, không phải cho "__MSG_…__".
const resolveMsg = (value, loc) => String(value || '').replace(/__MSG_(\w+)__/g, (_, k) => {
  const m = catalogs[loc][k] || (catalogs[manifest.default_locale] || {})[k];
  if (!m) problems.push(`_locales/${loc}: thiếu "${k}" mà manifest cần`);
  return m ? m.message : '';
});
for (const loc of locales) {
  const name = [...resolveMsg(manifest.name, loc)].length;
  const desc = [...resolveMsg(manifest.description, loc)].length;
  // Giới hạn của Chrome Web Store (bản đầy đủ không lên Store nên chỉ cảnh báo).
  const over = [name > 75 && `tên dài ${name} > 75 ký tự`, desc > 132 && `mô tả dài ${desc} > 132 ký tự`].filter(Boolean);
  for (const msg of over) {
    if (edition === 'store') problems.push(`_locales/${loc}: ${msg}`);
    else console.warn(`Cảnh báo: _locales/${loc}: ${msg}`);
  }
  for (const cmd of Object.values(manifest.commands || {})) resolveMsg(cmd.description, loc);
}
// Mọi khoá mà mã / HTML / manifest của bản này dùng phải có; các ngôn ngữ phải đủ khoá như nhau.
const check = spawnSync(process.execPath, [join(ROOT, 'tools', 'i18n-check.mjs'), '--root', out, '--quiet'], { encoding: 'utf8' });
if (check.status !== 0) problems.push(`kiểm tra bản dịch:\n${(check.stderr || check.stdout).trim()}`);

// Mọi tệp manifest nhắc tới phải có trong bản build.
const referenced = [
  manifest.background && manifest.background.service_worker,
  manifest.action && manifest.action.default_popup,
  ...Object.values(manifest.icons || {}),
  ...Object.values((manifest.action && manifest.action.default_icon) || {}),
  ...(manifest.content_scripts || []).flatMap((c) => [...(c.js || []), ...(c.css || [])]),
].filter(Boolean);
for (const ref of referenced) if (!existsSync(join(out, ref))) problems.push(`thiếu tệp ${ref}`);

if (problems.length) {
  console.error(`Build ${edition} LỖI:\n  - ${problems.join('\n  - ')}`);
  process.exit(1);
}
console.log(`Đã build bản ${edition} v${manifest.version} -> ${relative(ROOT, out)}`);

// ---- ZIP (tuỳ chọn): manifest.json ở gốc, thứ tự & thời gian cố định để build lặp lại cho cùng kết quả -----
if (ZIP) {
  const entries = walk(out).map((f) => ({ name: relative(out, f).split(sep).join('/'), data: readFileSync(f) }));
  const parts = [];
  const central = [];
  let offset = 0;
  const DOS_TIME = 0;
  const DOS_DATE = (1 << 5) | 1; // 1980-01-01
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const comp = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // tên tệp UTF-8
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    parts.push(local, nameBuf, comp);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0x0800, 8);
    cen.writeUInt16LE(8, 10);
    cen.writeUInt16LE(DOS_TIME, 12);
    cen.writeUInt16LE(DOS_DATE, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(comp.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, nameBuf);
    offset += local.length + nameBuf.length + comp.length;
  }
  const cenBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cenBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  const zip = Buffer.concat([...parts, cenBuf, end]);
  const zipPath = join(ROOT, 'dist', `cinema-tools-${edition}-v${manifest.version}.zip`);
  writeFileSync(zipPath, zip);
  const sha = createHash('sha256').update(zip).digest('hex');
  console.log(`ZIP: ${relative(ROOT, zipPath)} (${entries.length} tệp, ${zip.length} byte)\nSHA-256: ${sha}`);
}
