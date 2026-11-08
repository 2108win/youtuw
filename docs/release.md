# Phát hành Chrome Web Store – Cinema Tools

## Trạng thái (cập nhật 08/11/2026)

| Bước | Trạng thái |
| --- | --- |
| Bản Store v1.3.0 build từ mã nguồn (`node tools/build.mjs store --zip`) | ✅ Xong |
| Rà soát bảo mật độc lập ([security-review.md](security-review.md)) + sửa các điểm chặn | ✅ Xong (xem bảng trong tệp đó) |
| Chạy thử bản Store trong Chrome 156 (profile tạm, headless) | ✅ Không có lỗi JS (chi tiết bên dưới) |
| ZIP + SHA-256 | ✅ Xem "Gói phát hành" |
| Tải lên Developer Dashboard | ✅ Item ID `dijncihikjgbogahcbllbpldalnfkdfg` (Dashboard cảnh báo duyệt kỹ vì `<all_urls>`; chọn gửi luôn) |
| Gửi duyệt (Submit for review) | ✅ Theo người dùng báo ngày 08/11/2026 (chưa xem trực tiếp trạng thái trên Dashboard) |
| Được duyệt / công khai trên Store | ⏳ Chưa. Ngày 08/11/2026, https://chromewebstore.google.com/detail/dijncihikjgbogahcbllbpldalnfkdfg chuyển sang `/detail/empty-title/…`, tức chưa có listing công khai |

## Các bước gửi (bạn tự làm trong Chrome)

Chrome không cho bất kỳ extension hay công cụ tự động nào thao tác trên trang Chrome Web Store, nên bước này phải làm tay.

1. Mở https://chrome.google.com/webstore/devconsole → **New item** (Thêm mục mới) → chọn
   `dist/cinema-tools-store-v1.3.0.zip`.
2. Thẻ **Store listing**: dán *Mô tả chi tiết* ở mục "Nội dung listing" bên dưới; Category = Entertainment;
   Language = Vietnamese; tải 5 ảnh 1280×800 và ô quảng bá 440×280 trong `store/images/`; điền Support URL (và
   Homepage URL nếu muốn, xem lưu ý ở mục đó).
3. Thẻ **Privacy practices**: dán *Single purpose*, giải thích cho từng quyền, chọn "No, I am not using remote code",
   tích **Website content** và **Web history**, tích 3 cam kết, dán Privacy policy URL.
4. Thẻ **Distribution**: Public, tất cả khu vực (hoặc chọn khu vực bạn muốn).
5. Thẻ **Test instructions** (nếu có): dán đoạn "Ghi chú cho người duyệt".
6. Bấm **Save draft** → **Submit for review**. Ghi lại Item ID (32 chữ cái) và URL
   `https://chromewebstore.google.com/detail/<item-id>` để gắn vào trang web (`cinemaToolsLinks.store` trong
   `winlax-v2/src/features/cinema-tools/copy.ts`).

## Gói phát hành

- Nguồn: repo này → `node tools/build.mjs store --zip` → `dist/store/` (36 tệp, `manifest.json` ở gốc ZIP).
- ZIP: `dist/cinema-tools-store-v1.3.0.zip` – 95 116 byte – SHA-256
  `663042d2206b2d73ac93c99c936d62ddadf4545757956464a2a5aea65f33a488`.
- Không có trong ZIP: `native-host/`, tài liệu, công cụ build, ảnh listing, tệp ẩn, khoá.
- Manifest bản Store: tên `Cinema Tools – Công cụ xem video`, phiên bản `1.3.0`, `minimum_chrome_version` 116
  (offscreen dùng luồng tabCapture), quyền `storage, downloads, scripting, offscreen, tabCapture, activeTab`, host
  `<all_urls>`, content script trên `https://www.youtube.com/*`. Đã bỏ `nativeMessaging`, `cookies`, `webRequest` và toàn
  bộ code, CSS, biểu tượng của phần tải video / âm thanh / luồng / ảnh bìa YouTube.
- Bản đầy đủ cho GitHub Release: `node tools/build.mjs full --zip` → `dist/cinema-tools-full-v1.3.0.zip` (42 tệp, gồm
  `native-host/host.py, install.py, install.bat, uninstall.bat`, README, PRIVACY, LICENSE).

## Kết quả kiểm tra

| Kiểm tra | Kết quả |
| --- | --- |
| Build bản Store tự chặn chuỗi cấm (`yt-dlp`, `nativeMessaging`, `connectNative`, `chrome.cookies`, `chrome.webRequest`, `i.ytimg.com`…) | Đạt |
| `node --check` mọi tệp JS (bản Store, bản đầy đủ, mã nguồn) | Đạt |
| Nạp **chính nội dung giải nén từ ZIP** vào Chrome 156 qua CDP `Extensions.loadUnpacked` | Service worker chạy; `webRequest`/`cookies`/native không tồn tại; popup, `shot.html`, `offscreen.html` không lỗi console |
| YouTube thật (Big Buck Bunny, CC-BY Blender): nút trên trình phát | Có Cửa sổ nổi, Xoay/lật, Tắt đèn, Rạp phim; **không có** nút Tải về |
| Tắt đèn (Alt+Shift+L), Rạp phim (Alt+Shift+C) | Hoạt động, đèn nền hiện đúng |
| Popup mở bằng `chrome.action.openPopup()` trên tab YouTube | Thẻ Video đồng bộ trạng thái; Âm thanh liệt kê 1 tab; Ảnh quét 15 ảnh + nút Chụp khung hình; Tiện ích hiện đủ |
| Lưu "ảnh" có URL `.mp4` (định dạng Gốc) | Bản mới: từ chối, không có lượt tải. Bản trước khi sửa: **đã tải** `video.mp4` (lỗi B2, đã sửa) |
| Lưu ảnh từ `127.0.0.1` | Bản mới: từ chối "địa chỉ mạng nội bộ" |
| Content script trên YouTube gọi `vol:list` / `img:download` | Bản mới: không được phục vụ (`undefined`). Bản cũ: được phục vụ |
| Bản đầy đủ (thư mục gốc) sau khi đánh dấu code | Vẫn đủ quyền và thẻ Tải về, không lỗi |
| Checker của chrome-extension-builder (`check_extension.py`) | Báo "unsafe HTML asset" cho `/icons/...`, `/src/shared/shared.js`: **báo nhầm**. Checker không chấp nhận đường dẫn tính từ gốc extension, nhưng Chrome hỗ trợ và lần chạy thật đã nạp đúng. Vì vậy dùng ZIP của `tools/build.mjs` và kiểm tra bằng cách nạp lại bản giải nén. Cảnh báo `<all_urls>`: xem giải thích quyền |

Chưa chạy / chưa kiểm được:
- Lưu ảnh **thành công** xuống ổ đĩa: ở headless lệnh treo ở cả bản cũ lẫn bản mới (giới hạn môi trường), cần thử tay
  một lần trên Chrome thường.
- Tăng âm >100% (tabCapture cần thao tác thật trên popup).
- Cửa sổ nổi (cần cử chỉ người dùng).
- Chụp cả trang.
- Chế độ ẩn danh.

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

Extension không tải video hay âm thanh.

QUYỀN RIÊNG TƯ
Không có máy chủ, không analytics, không tải mã từ xa. Cài đặt chỉ lưu trong trình duyệt của bạn.
Chính sách quyền riêng tư: https://github.com/2108win/youtuw/blob/main/PRIVACY.md

Cinema Tools không liên kết với YouTube hay Google.
```

**Ảnh** (`store/images/`, chụp từ bản Store thật, nội dung video CC-BY của Blender Foundation):
1280×800: `1-tat-den-den-nen.png`, `2-rap-phim.png`, `3-am-luong-tung-tab.png`, `4-luu-anh-chup-khung-hinh.png`,
`5-chup-man-hinh.png`. Ô quảng bá nhỏ 440×280: `promo-440x280.png`. Biểu tượng 128×128 nằm trong ZIP.

**Support URL**: https://github.com/2108win/youtuw/issues

**Homepage URL**: bạn quyết. Cả repo GitHub lẫn trang `/cinema-tools` đều giới thiệu bản đầy đủ có tải video (yt-dlp).
Người duyệt có thể mở link này và coi listing đang dẫn tới công cụ tải video YouTube. Khuyến nghị: để trống ở lần gửi
đầu (Store không bắt buộc), thêm sau khi đã được duyệt. Mỗi lần đổi listing cũng phải duyệt lại, nhưng rủi ro thấp
hơn khi item đã có lịch sử tốt.

## Thẻ "Privacy practices"

**Single purpose**:

> Cinema Tools improves watching video in Chrome: YouTube player tools (rotate, flip, zoom/crop, lights-off with
> ambient light, cinema mode), Picture-in-Picture and per-tab volume for video on any site, and saving still images of
> what you are viewing (current video frame, page screenshot, images on the page). It does not download video or
> audio. All processing happens locally.

**Giải thích quyền** (dán vào Dashboard):

| Quyền | Giải thích |
| --- | --- |
| `storage` | Saves the user's settings (dimming level, ambient light, shortcuts) locally, and keeps per-tab volume levels in session storage so they survive a page reload. Nothing is synced or transmitted. |
| `downloads` | Saves only files the user explicitly asks for (page screenshots, the current video frame, images the user selects on a page) to the Downloads folder. Only image files are saved. |
| `scripting` | When the user clicks a feature in the popup or presses a shortcut, injects bundled scripts into that tab to open Picture-in-Picture, set the volume of its media elements, take a full-page screenshot, or list the images on the page. No remote code. |
| `offscreen` | Uses an offscreen document to convert user-selected images to PNG/JPG/WebP and create blob URLs for saving (a service worker cannot), and to host the Web Audio gain node that boosts tab volume above 100%. |
| `tabCapture` | Only when the user raises the current tab's volume above 100%: captures that tab's audio and plays it back amplified. Audio is never recorded, stored or transmitted. |
| `activeTab` | Temporary access to the current tab when the user opens the popup or presses Alt+P / Alt+S, for screenshots, Picture-in-Picture and the volume boost (tabCapture stream ID). |
| Host `<all_urls>` | The per-tab volume mixer lists and controls every tab that is playing audio, not only the active one, including media in embedded frames, so it must inject the bundled volume script into those tabs. Image saving reads the selected images from their own hosts (often CDNs on other domains). All processing stays on the device. |
| Content script `youtube.com` | Adds the player tools (rotate/flip, zoom, lights-off, ambient light, cinema mode, Picture-in-Picture button) to the YouTube watch page. |

**Remote code**: No, I am not using remote code (mọi JS nằm trong gói).

**Data usage**: tích **Website content** (ảnh trên trang, ảnh chụp màn hình, khung hình video, âm thanh tab khi tăng âm)
và **Web history** (tiêu đề, URL các tab đang phát âm thanh trong bộ trộn âm lượng). Theo
[User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq) câu 3, dữ liệu chỉ xử lý trên
máy vẫn phải khai báo. Không tích PII, sức khoẻ, tài chính, xác thực, liên lạc cá nhân, vị trí, hoạt động người dùng.
Tích cả 3 cam kết: không bán dữ liệu cho bên thứ ba, không dùng/chuyển dữ liệu cho mục đích không liên quan, không dùng
để xét tín dụng.

**Privacy policy URL**: https://github.com/2108win/youtuw/blob/main/PRIVACY.md

## Ghi chú cho người duyệt (Test instructions)

```text
No account or login is needed. All features are local. This extension does not download video or audio.
1. Open https://www.youtube.com/watch?v=aqz-KE-bpKQ (Big Buck Bunny, CC-BY). New buttons appear in the player's control bar: Picture-in-Picture, Rotate/flip & zoom, Lights off, Cinema.
2. Click the bulb button (or Alt+Shift+L) to dim the page with ambient light; Esc to undo.
3. Click the toolbar icon. Tabs: Video (rotate/flip/zoom/crop), Âm thanh (per-tab volume; drag above 100% on the current tab to boost), Ảnh (images on the page + current video frame), Tiện ích (screenshots: full page, visible area, region).
4. Alt+P opens Picture-in-Picture for the playing video on any site; Alt+S captures the full page.
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

- **Single purpose (Red Magnesium), rủi ro vừa đến cao**: gộp công cụ trình phát YouTube với cửa sổ nổi / âm lượng / chụp
  màn hình / lưu ảnh trên mọi trang. Bản rà soát khuyên bỏ phần lưu ảnh trên trang khỏi bản Store. Nếu bị từ chối với
  lý do này: bỏ thẻ Ảnh (và có thể cả chụp cả trang) khỏi bản Store rồi gửi lại.
- **`<all_urls>`**: nhiều khả năng bị duyệt kỹ và lâu hơn. Phương án giảm: chuyển sang `optional_host_permissions` và
  xin quyền khi người dùng dùng bộ trộn âm lượng / lưu ảnh lần đầu.
- **Link tới bản đầy đủ** (Homepage, mô tả): xem lưu ý ở mục Homepage URL.
- **Biểu tượng**: khung bo góc với nút play (khác màu, kiểu so với logo YouTube); rủi ro thấp.
