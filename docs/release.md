# Phát hành Chrome Web Store – Cinema Tools

## Bản 1.4.0 – thêm "Xem trước khi chia sẻ" (13/11/2026)

Thẻ **Tiện ích** → **Kiểm tra trang này**: mở trang báo cáo (`src/share/`) xem liên kết của trang hiện ra sao trên
mạng xã hội và Google, chấm điểm thẻ Open Graph / SEO và gợi ý sửa; có ô nhập để kiểm tra một địa chỉ khác. **Không thêm
quyền mới** (dùng `scripting` + host `<all_urls>` sẵn có). Bộ lọc địa chỉ mạng nội bộ chuyển sang `src/shared/net.js`, dùng
chung cho phần lưu ảnh (`offscreen.js`).

Cũng trong 1.4.0: **đa ngôn ngữ** (14 ngôn ngữ trong `_locales/`, giao diện theo ngôn ngữ của Chrome, mặc định tiếng Anh,
tiếng Việt giữ nguyên câu chữ cũ) và **gọn giao diện** (bỏ phụ đề / đoạn giải thích, chuyển thành tooltip; icon cài đặt
và "Đang thấy" mới; nút "Đổi phím tắt").

| Bước | Trạng thái |
| --- | --- |
| Rà soát bảo mật độc lập phần mới ([security-review.md](security-review.md), mục 1.4.0) | ✅ Xong 13/11/2026, đã sửa S1, S2, D1, I1, I3, I4, L1, P2, P3 trong mã nguồn / tài liệu; P1 (single purpose) do bạn quyết, xem dưới |
| Build `node tools/build.mjs store --zip` (sau khi thêm đa ngôn ngữ) | ✅ `dist/cinema-tools-store-v1.4.0.zip` – 57 tệp – 288 018 byte – SHA-256 `4c41f787184c91eafb41bf61dcb85288fdfd34485669b180791b7f078b953b98` |
| Bộ chặn chuỗi cấm của bản Store (cả trong `_locales`), `node tools/i18n-check.mjs`, `node --check`, 25 ca thử bộ lọc mạng nội bộ | ✅ Đạt (678 khoá × 14 ngôn ngữ) |
| Nạp nội dung giải nén từ ZIP vào Chrome 157 (CDP, headless), popup → Tiện ích → Kiểm tra trang này | ✅ Trang mẫu (thẻ chỉ có sau JS, trang 403, trang "độc": ảnh/biểu tượng SVG có script, `javascript:` trong canonical / og:url, HTML trong og:title), vnexpress.net, YouTube: đúng kết quả, không lỗi console, không tạo blob SVG; quyền thực tế đúng 6 quyền của bản Store; lưu ảnh từ `http://router/`, `http://localhost./` bị từ chối |
| Chạy thử bản đa ngôn ngữ (Chrome 157 headless, `--lang`): popup 5 thẻ, trang chia sẻ, trang ảnh chụp, service worker | ✅ Bản đầy đủ: cả 14 ngôn ngữ; bản Store: en, vi, ja, de. Không lỗi JS, không lộ khoá, không chữ trống |
| Tải lên Dashboard + gửi duyệt | ⏳ Bạn tự làm (xem dưới) |

**1.3.0 đã công khai** (kiểm ngày 13/11/2026: trang Store hiện "Cinema Tools – Công cụ xem video", phiên bản 1.3.0), nên
gửi 1.4.0 như một bản cập nhật. "Xem trước khi chia sẻ" làm tăng rủi ro bị từ chối vì single purpose (P1); nếu 1.4.0 bị
từ chối thì 1.3.0 vẫn công khai.

**Các ô trên Dashboard cần sửa cho 1.4.0** (nội dung mới đã ghi ở các mục bên dưới):
- *Package*: Upload new package → `dist/cinema-tools-store-v1.4.0.zip`.
- *Ngôn ngữ listing*: gói có `_locales` với `default_locale: en`, nên Dashboard chuyển sang listing theo ngôn ngữ, mặc
  định **English**. Tên và mô tả ngắn của từng ngôn ngữ tự lấy từ `ext_name_store` / `ext_desc_store` trong `_locales`.
  Dán *Mô tả chi tiết* tiếng Anh (mục "Nội dung listing (tiếng Anh)") vào English; giữ mô tả tiếng Việt ở Vietnamese.
  Các ngôn ngữ khác để trống thì Store dùng mô tả tiếng Anh.
- *Mô tả chi tiết* tiếng Việt: thêm dòng "Xem trước khi chia sẻ" và câu không liên kết ở cuối.
- *Single purpose* và *giải thích quyền* `scripting`, host `<all_urls>`: dán bản mới.
- *Data usage*: giữ nguyên (Website content đã bao gồm thẻ `<head>` của trang được kiểm tra).
- *Test instructions*: dán bản mới (tên thẻ tiếng Anh, vì người duyệt dùng Chrome tiếng Anh sẽ thấy giao diện tiếng Anh).
- *Privacy policy*: đẩy `PRIVACY.md` mới lên GitHub **trước khi** gửi duyệt.

**Chưa kiểm được**: bấm các liên kết Facebook Sharing Debugger / LinkedIn Post Inspector / Rich Results Test (chỉ mở
trang ngoài); trang báo cáo trên màn hình hẹp chỉ xem qua ở 800 px.

## Trạng thái bản 1.3.0 (cập nhật 08/11/2026)

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

Chrome không cho bất kỳ extension hay công cụ tự động nào thao tác trên trang Chrome Web Store, nên bước này phải làm tay
(thử lại ngày 13/11/2026 bằng Claude in Chrome: "The extensions gallery cannot be scripted").

1. Mở https://chrome.google.com/webstore/devconsole → **New item** (Thêm mục mới) → chọn
   `dist/cinema-tools-store-v1.3.0.zip`.
2. Thẻ **Store listing**: dán *Mô tả chi tiết* ở mục "Nội dung listing" bên dưới; Category = Entertainment;
   Language = Vietnamese (bản 1.3.0; từ 1.4.0 ngôn ngữ lấy từ `_locales` trong gói, xem trên); tải 5 ảnh 1280×800 và ô quảng bá 440×280 trong `store/images/`; điền Support URL (và
   Homepage URL nếu muốn, xem lưu ý ở mục đó).
3. Thẻ **Privacy practices**: dán *Single purpose*, giải thích cho từng quyền, chọn "No, I am not using remote code",
   tích **Website content** và **Web history**, tích 3 cam kết, dán Privacy policy URL.
4. Thẻ **Distribution**: Public, tất cả khu vực (hoặc chọn khu vực bạn muốn).
5. Thẻ **Test instructions** (nếu có): dán đoạn "Ghi chú cho người duyệt".
6. Bấm **Save draft** → **Submit for review**. Ghi lại Item ID (32 chữ cái) và URL
   `https://chromewebstore.google.com/detail/<item-id>` để gắn vào trang web (`cinemaToolsLinks.store` trong
   `winlax-v2/src/features/cinema-tools/copy.ts`).

## Gói phát hành

Bản 1.4.0: xem bảng ở đầu tệp (Store 57 tệp; bản đầy đủ `dist/cinema-tools-full-v1.4.0.zip` 63 tệp – 367 275 byte –
SHA-256 `894e9e531d140efd413040c7c44db8083e0d27a80e29fd63fb6a758c65f30d63`). Phần dưới là bản 1.3.0.

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

**Mô tả ngắn** (manifest, 128 ký tự, từ 1.4.0): Xoay, lật, phóng to video YouTube, tắt đèn có đèn nền. Cửa sổ nổi, âm
lượng từng tab, chụp màn hình, lưu ảnh, xem trước chia sẻ.

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
• Xem trước khi chia sẻ: xem liên kết của trang sẽ hiện ra sao khi chia sẻ lên mạng xã hội và trên Google; chấm điểm thẻ Open Graph, kiểm tra ảnh chia sẻ và gợi ý thẻ cần sửa.

Extension không tải video hay âm thanh.

QUYỀN RIÊNG TƯ
Không có máy chủ, không analytics, không tải mã từ xa. Cài đặt chỉ lưu trong trình duyệt của bạn.
Chính sách quyền riêng tư: https://github.com/2108win/youtuw/blob/main/PRIVACY.md

Cinema Tools không liên kết với YouTube, Google hay các mạng xã hội được nhắc tới.
```

(Bản 1.3.0: câu cuối là "Cinema Tools không liên kết với YouTube hay Google.")

## Nội dung listing (tiếng Anh – ngôn ngữ mặc định từ 1.4.0)

**Tên** (`ext_name_store` trong `_locales/en`): Cinema Tools – Video Viewing Tools

**Mô tả ngắn** (`ext_desc_store`, 129 ký tự): Rotate, flip & zoom YouTube videos, lights off with ambient glow.
Picture-in-Picture, per-tab volume, screenshots, share preview.

**Mô tả chi tiết**:

```text
Cinema Tools makes watching video in Chrome more comfortable. Everything runs on your device: no account, no ads, no data collection, open source. Available in 14 languages.

ON YOUTUBE
• Rotate & flip: mirror horizontally, flip vertically, rotate 90° / 180°. The video always fits the frame, including theater mode and full screen.
• Lights off: dims the whole page except the player. Click the dark area or press Esc to turn the lights back on.
• Ambient glow: the colors at the edges of the video spread softly around the player in lights-off, Cinema mode and full screen; colors change slowly, without flicker.
• Cinema mode: the player fills the whole browser window.
• Zoom & crop: auto-detect and crop black bars, fill the frame, crop to 21:9 / 4:3, zoom 100–500% and drag to pan.
• Capture the current frame at full resolution.
• Buttons right on the player, plus shortcuts Alt + Shift + L / C / H / V / E / R / A / + / − / 0 / S / P.

ON ANY SITE
• Picture-in-Picture for the playing video, floating above all apps – Alt+P.
• Per-tab volume: 0–100% for every tab playing audio, up to 600% for the current tab, and "Only this tab".
• Screenshots: full page (scrolls and stitches automatically), visible area or a selected region – Alt+S. Save as PNG / JPG or copy.
• Save page images: finds every image, picks the largest version it can, saves as Original / PNG / JPG / WebP.
• Share preview: see how the page's link will look when shared on social networks and in Google; scores Open Graph tags, checks the share image and suggests tags to fix.

The extension does not download video or audio.

PRIVACY
No servers, no analytics, no remote code. Settings stay in your browser.
Privacy policy: https://github.com/2108win/youtuw/blob/main/PRIVACY.md

Cinema Tools is not affiliated with YouTube, Google or the social networks mentioned.
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
> what you are viewing (current video frame, page screenshot, images on the page). It also previews how the page you
> are viewing will look when its link is shared (title, description and image cards on social networks and search).
> It does not download video or audio. All processing happens locally.

(Bản 1.3.0 gửi đoạn trên nhưng không có câu "It also previews…".)

**Giải thích quyền** (dán vào Dashboard):

| Quyền | Giải thích |
| --- | --- |
| `storage` | Saves the user's settings (dimming level, ambient light, shortcuts) locally, and keeps per-tab volume levels in session storage so they survive a page reload. Nothing is synced or transmitted. |
| `downloads` | Saves only files the user explicitly asks for (page screenshots, the current video frame, images the user selects on a page) to the Downloads folder. Only image files are saved. |
| `scripting` | When the user clicks a feature in the popup or presses a shortcut, injects bundled scripts into that tab to open Picture-in-Picture, set the volume of its media elements, take a full-page screenshot, list the images on the page, or read the page's `<head>` meta tags for the share preview. No remote code. |
| `offscreen` | Uses an offscreen document to convert user-selected images to PNG/JPG/WebP and create blob URLs for saving (a service worker cannot), and to host the Web Audio gain node that boosts tab volume above 100%. |
| `tabCapture` | Only when the user raises the current tab's volume above 100%: captures that tab's audio and plays it back amplified. Audio is never recorded, stored or transmitted. |
| `activeTab` | Temporary access to the current tab when the user opens the popup or presses Alt+P / Alt+S, for screenshots, Picture-in-Picture and the volume boost (tabCapture stream ID). |
| Host `<all_urls>` | The per-tab volume mixer lists and controls every tab that is playing audio, not only the active one, including media in embedded frames, so it must inject the bundled volume script into those tabs. Image saving reads the selected images from their own hosts (often CDNs on other domains). The share preview, only when the user clicks "Check this page" (or types an address into the report page), re-fetches that page's URL once, without cookies, plus the share image and favicon the page declares from whatever server hosts them, to show what social-network crawlers see. Images at private-network addresses are not fetched for public pages. All processing stays on the device. |
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
No account or login is needed. All features are local. This extension does not download video or audio. The UI follows Chrome's language (English by default; 14 languages included).
1. Open https://www.youtube.com/watch?v=aqz-KE-bpKQ (Big Buck Bunny, CC-BY). New buttons appear in the player's control bar: Picture-in-Picture, Rotate/flip & zoom, Lights off, Cinema mode.
2. Click the bulb button (or Alt+Shift+L) to dim the page with ambient glow; Esc to undo.
3. Click the toolbar icon. Tabs: Video (rotate/flip/zoom/crop), Audio (per-tab volume; drag above 100% on the current tab to boost), Images (images on the page + current video frame), Tools (screenshots: full page, visible area, region; share preview). The gear icon opens Settings.
4. Alt+P opens Picture-in-Picture for the playing video on any site; Alt+S captures the full page.
5. On any web page, click the toolbar icon → Tools → "Check this page". A report tab opens with approximate previews of the page's link card on social networks and in search results, a score and suggested meta tags. The address box at the top of the report checks another URL. Not available in incognito windows.
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
  Từ 1.4.0, **Xem trước khi chia sẻ** (kiểm tra thẻ Open Graph / SEO) là phần lệch mục đích "công cụ xem video" nhiều
  nhất. Nếu bị từ chối vì single purpose: bỏ tính năng này khỏi bản Store trước (bọc thẻ trong popup bằng `#full-start` /
  `#full-end` và cho `tools/build.mjs` xoá thư mục `src/share` khi build Store), tăng `version` rồi gửi lại.
- **`<all_urls>`**: nhiều khả năng bị duyệt kỹ và lâu hơn. Phương án giảm: chuyển sang `optional_host_permissions` và
  xin quyền khi người dùng dùng bộ trộn âm lượng / lưu ảnh lần đầu.
- **Link tới bản đầy đủ** (Homepage, mô tả): xem lưu ý ở mục Homepage URL.
- **Biểu tượng**: khung bo góc với nút play (khác màu, kiểu so với logo YouTube); rủi ro thấp.
