# Phát hành Chrome Web Store – Cinema Tools

## Trạng thái (cập nhật 08/11/2026)

| Bước | Trạng thái |
| --- | --- |
| Bản Store v1.3.0 build từ mã nguồn (`node tools/build.mjs store --zip`) | ✅ Xong |
| Chạy thử bản Store trong Chrome 156 (profile tạm, headless) | ✅ Không có lỗi JS (chi tiết bên dưới) |
| ZIP + SHA-256 | ✅ `dist/cinema-tools-store-v1.3.0.zip`, xem mục "Gói phát hành" |
| Tải lên Developer Dashboard | ⏳ Chưa |
| Gửi duyệt (Submit for review) | ⏳ Chưa |
| Được duyệt / công khai trên Store | ⏳ Chưa (chỉ coi là xong khi thấy trạng thái trên Dashboard) |

## Gói phát hành

- Nguồn: `D:\winlax\job\youtuw` → build `dist/store/` (36 tệp, `manifest.json` ở gốc ZIP).
- ZIP: `dist/cinema-tools-store-v1.3.0.zip` – 96 494 byte – SHA-256
  `a4bfafd9d05f7d26d7d3d2110264e416d23be441a7114377e3ceeacfc9f45c2f`.
- Không có trong ZIP: `native-host/`, tài liệu, công cụ build, ảnh listing, tệp ẩn, khoá.
- Manifest bản Store: tên `Cinema Tools – Công cụ xem video`, phiên bản `1.3.0`, quyền `storage, downloads, scripting,
  offscreen, tabCapture, activeTab`, host `<all_urls>`, content script trên `https://www.youtube.com/*`.
  Đã bỏ `nativeMessaging`, `cookies`, `webRequest` và toàn bộ code tải video / âm thanh / luồng / ảnh bìa YouTube.

## Kết quả kiểm tra

| Kiểm tra | Kết quả |
| --- | --- |
| Build bản Store tự chặn chuỗi cấm (`yt-dlp`, `nativeMessaging`, `connectNative`, `chrome.cookies`, `chrome.webRequest`, `i.ytimg.com`…) | Đạt |
| `node --check` mọi tệp JS (bản Store, bản đầy đủ, mã nguồn) | Đạt |
| Nạp **chính nội dung giải nén từ ZIP** vào Chrome 156 qua CDP `Extensions.loadUnpacked` | Service worker chạy; `webRequest`/`cookies`/native không tồn tại; popup, `shot.html`, `offscreen.html` không lỗi console |
| YouTube thật (Big Buck Bunny, CC-BY Blender): nút trên trình phát | Có Cửa sổ nổi, Xoay/lật, Tắt đèn, Rạp phim; **không có** nút Tải về |
| Tắt đèn (Alt+Shift+L), Rạp phim (Alt+Shift+C) | Hoạt động, đèn nền hiện đúng |
| Popup mở bằng `chrome.action.openPopup()` trên tab YouTube | Thẻ Video đồng bộ trạng thái; Âm thanh liệt kê 1 tab; Ảnh quét 15 ảnh + nút Chụp khung hình; Tiện ích hiện đủ |
| Bản đầy đủ (thư mục gốc) sau khi đánh dấu code | Vẫn đủ quyền và thẻ Tải về, không lỗi |
| Checker của chrome-extension-builder (`check_extension.py`) | Báo "unsafe HTML asset" cho `/icons/...`, `/src/shared/shared.js`: **báo nhầm**. Checker không chấp nhận đường dẫn tính từ gốc extension, nhưng Chrome hỗ trợ và lần chạy thật đã nạp đúng. Vì vậy dùng ZIP của `tools/build.mjs` và kiểm tra bằng cách nạp lại bản giải nén. Cảnh báo `<all_urls>`: xem giải thích quyền |

Chưa chạy: thử tay trên Chrome thường của người dùng; tăng âm >100% (tabCapture cần thao tác thật trên popup); cửa sổ nổi
(cần cử chỉ người dùng); chụp cả trang và lưu ảnh xuống ổ đĩa ở chế độ headless.

## Nội dung listing (tiếng Việt)

**Tên** (lấy từ manifest): Cinema Tools – Công cụ xem video

**Mô tả ngắn** (manifest, 111 ký tự): Xoay, lật, phóng to video YouTube, tắt đèn có đèn nền. Cửa sổ nổi, âm lượng từng tab,
chụp màn hình và lưu ảnh.

**Danh mục**: Giải trí (Entertainment) · **Ngôn ngữ**: Tiếng Việt

**Mô tả chi tiết**:

```text
Cinema Tools giúp xem video trong Chrome thoải mái hơn. Mọi thứ chạy ngay trên máy bạn: không tài khoản, không quảng cáo, không thu thập dữ liệu, mã nguồn mở.

TRÊN YOUTUBE
• Xoay & lật video: lật ngang (soi gương), lật dọc, xoay 90° / 180°. Video tự vừa khung, kể cả ở chế độ rạp và toàn màn hình.
• Tắt đèn: làm tối cả trang, chỉ chừa trình phát. Bấm vùng tối hoặc Esc để bật lại.
• Đèn nền quanh video: màu mép video loang ra mềm mại khi tắt đèn, ở Rạp phim và toàn màn hình; đổi màu chậm, không nhấp nháy.
• Rạp phim: trình phát tràn kín cửa sổ trình duyệt.
• Phóng to & cắt viền: tự dò và cắt viền đen, lấp đầy khung, cắt 21:9 / 4:3, phóng 100–500% và kéo chuột để di chuyển.
• Chụp khung hình đang phát ở độ phân giải gốc.
• Nút ngay trên trình phát và phím tắt Alt + Shift + L / C / H / V / E / R / A / + / − / 0 / S / P.

TRÊN MỌI TRANG
• Cửa sổ nổi (Picture-in-Picture) cho video đang phát, nằm trên mọi ứng dụng – Alt+P.
• Âm lượng từng tab: 0–100% cho mọi tab đang phát, tăng tới 600% cho tab đang xem, "Chỉ nghe tab này".
• Chụp màn hình: cả trang (tự cuộn và ghép), phần đang thấy hoặc chọn vùng – Alt+S. Tải PNG / JPG hoặc sao chép.
• Lưu ảnh trên trang: tìm mọi ảnh, tự đoán bản lớn nhất, lưu Gốc / PNG / JPG / WebP.

QUYỀN RIÊNG TƯ
Không có máy chủ, không analytics, không tải mã từ xa. Cài đặt chỉ lưu trong trình duyệt của bạn.
Chính sách quyền riêng tư: https://github.com/2108win/youtuw/blob/main/PRIVACY.md
Mã nguồn (MIT): https://github.com/2108win/youtuw

Cinema Tools không liên kết với YouTube hay Google.
```

**Ảnh** (`store/images/`, chụp từ bản Store thật, nội dung video CC-BY của Blender Foundation):
1280×800: `1-tat-den-den-nen.png`, `2-rap-phim.png`, `3-am-luong-tung-tab.png`, `4-luu-anh-chup-khung-hinh.png`,
`5-chup-man-hinh.png`. Ô quảng bá nhỏ 440×280: `promo-440x280.png`. Biểu tượng 128×128 nằm trong ZIP.

**Trang chủ**: https://github.com/2108win/youtuw · **Hỗ trợ**: https://github.com/2108win/youtuw/issues

## Thẻ "Privacy practices"

**Single purpose**:

> Cinema Tools improves how you watch video in Chrome. On YouTube it adjusts the player (rotate/flip, zoom and crop
> black bars, lights-off with ambient light, full-window cinema mode). On any page it gives the video you are watching
> Picture-in-Picture, per-tab volume control, and lets you capture what you are watching (current video frame,
> page screenshot, images on the page). All processing happens locally.

**Giải thích quyền**:

| Quyền | Giải thích (dán vào Dashboard) |
| --- | --- |
| `storage` | Saves the user's settings (dimming level, ambient light, shortcuts) locally, and keeps per-tab volume levels in session storage so they survive a page reload. |
| `downloads` | Saves files the user explicitly asks for: page screenshots, the current video frame, and images the user selects on a page, into the Downloads folder. |
| `scripting` | When the user clicks a feature in the popup or presses a shortcut, injects bundled scripts into that tab to open Picture-in-Picture, set the volume of its media elements, take a full-page screenshot, or list the images on the page. |
| `offscreen` | Uses an offscreen document to convert images to PNG/JPG/WebP before saving (service workers cannot create blob URLs) and to amplify tab audio above 100% with the Web Audio API. |
| `tabCapture` | Only when the user raises the current tab's volume above 100%: captures that tab's audio stream and amplifies it locally. Audio is never recorded or stored. |
| `activeTab` | Grants temporary access to the tab the user is on when they open the popup or use a keyboard shortcut (screenshot, Picture-in-Picture). |
| Host `<all_urls>` | The per-tab volume mixer lists and controls every tab that is playing audio, not only the active one, so it must inject the bundled volume script into background tabs. Image saving fetches the selected images from their own websites, which can be on any domain. No page data is sent anywhere. |
| Content script `youtube.com` | Adds the player tools (rotate/flip, zoom, lights-off, ambient light, cinema mode, Picture-in-Picture button) to the YouTube watch page. |

**Remote code**: No, I am not using remote code (mọi JS nằm trong gói).

**Data usage**: không chọn mục dữ liệu nào (không thu thập, không truyền ra khỏi máy). Tích cả 3 cam kết: không bán dữ
liệu cho bên thứ ba, không dùng/chuyển dữ liệu cho mục đích không liên quan, không dùng để xét tín dụng.

**Privacy policy URL**: https://github.com/2108win/youtuw/blob/main/PRIVACY.md

## Ghi chú cho người duyệt (Test instructions)

```text
No account or login is needed. All features are local.
1. Open https://www.youtube.com/watch?v=aqz-KE-bpKQ (Big Buck Bunny, CC-BY). New buttons appear in the player's control bar: Picture-in-Picture, Rotate/flip & zoom, Lights off, Cinema.
2. Click the bulb button (or Alt+Shift+L) to dim the page with ambient light; Esc to undo.
3. Click the toolbar icon. Tabs: Video (rotate/flip/zoom/crop), Âm thanh (per-tab volume; drag above 100% on the current tab to boost), Ảnh (images on the page + current video frame), Tiện ích (screenshots: full page, visible area, region).
4. Alt+P opens Picture-in-Picture for the playing video on any site; Alt+S captures the full page.
This extension does not download videos or audio.
```

## Cập nhật & quay lui

- Cập nhật: tăng `version` trong `manifest.json` → `node tools/build.mjs store --zip` → Dashboard → Package → Upload new
  package → Submit for review. Mỗi bản cập nhật đều qua duyệt lại; người dùng nhận bản mới khi Chrome tự cập nhật
  (thường trong vài giờ sau khi duyệt).
- Quay lui: Store không có nút trả về bản cũ ngay. Cách làm: build lại từ commit/tag cũ với `version` **cao hơn** bản lỗi
  rồi gửi duyệt; trường hợp gấp có thể Unpublish tạm thời trong Dashboard.
- Nên gắn tag git cho mỗi bản gửi Store (vd. `store-v1.3.0`) để build lại đúng mã nguồn.
- Không có backend, không có dữ liệu cần di chuyển giữa các phiên bản; cài đặt cũ trong `chrome.storage.local` vẫn dùng
  được (khoá `dlCookies` thừa của bản đầy đủ bị bỏ qua).

## Rủi ro bị từ chối còn lại

- **Single purpose**: gộp công cụ trình phát YouTube với cửa sổ nổi / âm lượng / chụp màn hình / lưu ảnh trên mọi trang. Đã
  viết mục đích chung là "xem video tốt hơn"; nếu bị từ chối với lý do này, tách phần chụp màn hình + lưu ảnh ra
  extension riêng.
- **`<all_urls>`**: nhiều khả năng bị duyệt kỹ hơn và lâu hơn. Phương án giảm: chuyển sang `optional_host_permissions`
  và xin quyền khi người dùng dùng bộ trộn âm lượng lần đầu.
- **Biểu tượng**: khung bo góc với nút play (khác màu, kiểu so với logo YouTube); rủi ro thấp.
