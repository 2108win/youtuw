/*
 * Nhận diện địa chỉ trong mạng nội bộ / máy này, dùng chung cho trang ẩn lưu ảnh (offscreen.js) và trang
 * "Xem trước khi chia sẻ". Trang web có thể khai báo sẵn những địa chỉ như vậy (ảnh, biểu tượng…): extension không tự
 * gửi yêu cầu tới đó.
 * Chỉ xét theo tên máy / địa chỉ IP viết trong URL (tên miền công khai trỏ về IP nội bộ thì không nhận ra được).
 */
(() => {
  'use strict';
  if (globalThis.YTX_NET) return;

  function isPrivateIPv4(a, b) {
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127) // CGNAT 100.64.0.0/10
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168);
  }

  function isPrivateHost(url) {
    let host;
    try {
      // URL chuẩn hoá sẵn các dạng IPv4 (0x7f.1, 2130706433…) và IPv6; bỏ dấu chấm cuối ("localhost.").
      host = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/, '');
    } catch (_) {
      return true;
    }
    if (!host) return true;
    if (host.includes(':')) {
      if (host === '::' || host === '::1') return true;
      if (/^f[cd][0-9a-f]{2}:/.test(host) || /^fe[89a-f][0-9a-f]:/.test(host)) return true; // fc00::/7, fe80::/10, fec0::/10
      // IPv4 viết dạng IPv6: ::ffff:7f00:1 (= ::ffff:127.0.0.1) hoặc ::7f00:1
      const v4 = host.match(/^::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
      if (v4) {
        const hi = parseInt(v4[1], 16);
        return isPrivateIPv4(hi >> 8, hi & 255);
      }
      return false;
    }
    const m = host.match(/^(\d+)\.(\d+)\.\d+\.\d+$/);
    if (m) return isPrivateIPv4(+m[1], +m[2]);
    if (host === 'localhost' || host.endsWith('.localhost')) return true;
    // Tên một nhãn (router, may-chu…) và các đuôi chỉ dùng trong mạng nội bộ.
    if (!host.includes('.')) return true;
    return /\.(local|lan|home|internal|intranet|corp|private|home\.arpa)$/.test(host);
  }

  globalThis.YTX_NET = Object.freeze({ isPrivateHost });
})();
