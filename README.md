# Cinema Tools for YouTube

Extension Chrome (Manifest V3) thêm công cụ xem phim cho trình phát YouTube, cửa sổ nổi và chỉnh âm lượng từng tab,
và công cụ tải video / âm thanh / ảnh trên mọi trang web:

- **Cửa sổ nổi (mọi trang)**: mở video đang phát trong cửa sổ Picture-in-Picture mặc định của trình duyệt, luôn nằm trên
  mọi ứng dụng để vừa xem vừa làm việc khác (phát/dừng, quay lại tab, đóng; YouTube có thêm video trước/sau). Mở được cả
  với trang cố tình chặn cửa sổ nổi.
  Mở bằng nút **Cửa sổ nổi** ở đầu popup, nút trên trình phát YouTube, `Alt+P` (mọi trang) hoặc `Alt+Shift+P` (YouTube).
  Trên YouTube có thể tự mở khi chuyển sang tab khác.
- **Âm lượng từng tab**: thẻ **Âm thanh** trong popup liệt kê các tab đang phát; mỗi tab có thanh âm lượng 0–100%,
  tắt tiếng, cửa sổ nổi, bấm tên để chuyển tới tab. Tab đang mở popup kéo được tới **600%** (tăng âm, có chặn đỉnh để
  không rè). "Chỉ nghe tab này" tắt tiếng mọi tab khác. Mức âm lượng giữ nguyên khi trang trong tab tải lại.
- **Chụp màn hình (mọi trang)** – thẻ **Tiện ích** hoặc `Alt+S`: **Cả trang** (tự cuộn từng màn hình rồi ghép, thanh
  tiêu đề dính chỉ giữ ở đầu ảnh), **Phần đang thấy**, **Chọn vùng** (kéo chuột, Esc để huỷ). Ảnh mở ở tab mới để xem
  (bấm ảnh để xem cỡ thật), **Tải PNG / JPG** hoặc **Sao chép** để dán. Ảnh giữ đúng độ nét màn hình (vd. 125%).

- **Xoay & lật video**: lật ngang (soi gương), lật dọc, xoay trái/phải 90°, xoay 180°, đặt lại.
  Khi xoay 90° video tự thu/phóng cho vừa khung, kể cả ở chế độ rạp và toàn màn hình.
- **Tắt đèn**: làm tối cả trang, chỉ chừa trình phát. Bấm vào vùng tối hoặc nhấn `Esc` để bật lại.
- **Đèn nền quanh video**: khi tắt đèn (và ở Rạp phim, toàn màn hình), màu mép video loang ra cả 4 phía thành
  mảng sáng mềm (lớp gần + lớp xa mờ nhiều), bắt đầu ngay sát mép với đúng màu đó nên chuyển tiếp mềm, ra xa thì
  nhạt dần vào nền tối. Ánh sáng chỉ nằm bên ngoài: video luôn hiện đủ 100%, không bị che mép. Màu đổi chậm và êm (~1 giây lớp gần, ~2 giây lớp xa) nên không nhấp nháy theo từng khung
  hình, đỡ mỏi mắt. Phần viền đen trong khung (chế độ rạp của YouTube) cũng được lấp. Đi theo hướng xoay/lật/phóng to.
- **Rạp phim**: trình phát tràn kín cửa sổ trình duyệt, viền đen được lấp bằng đèn nền.
- **Phóng to & cắt viền**:
  - **Tự cắt viền**: dò viền đen in sẵn trong video (vd. phim 21:9 đóng khung 16:9) rồi phóng cho hình lấp kín khung.
  - **Lấp đầy**: bỏ viền đen do khung trình phát khác tỉ lệ video.
  - **Cắt theo tỉ lệ 21:9 / 4:3**.
  - **Phóng to / thu nhỏ** (100–500%). Khi đang phóng to, **kéo video bằng chuột** để di chuyển khung hình.

  Tự lấp đầy chỉ phóng tối đa 150% so với mức vừa khung (đang xoay 90° hoặc cửa sổ hẹp thì không cắt mất quá nhiều hình);
  muốn phóng thêm thì bấm `+`.
- **Tải về (mọi trang web)** – thẻ **Tải về** trong popup:
  - **Video & âm thanh** qua [yt-dlp](https://github.com/yt-dlp/yt-dlp) (YouTube, Facebook, TikTok, Vimeo, X… hơn 1000 trang):
    chọn **chất lượng** (Tốt nhất, 4K, 1440p, 1080p… kèm dung lượng ước tính) và **định dạng**
    (video: MP4 / WebM / MKV; chỉ âm thanh: MP3 / M4A / Opus). Có tiến độ, huỷ, mở tệp / mở thư mục khi xong.
    Trang có nhiều video thì chọn từng video. Trên **bảng tin** (Facebook, Instagram, TikTok, X…) địa chỉ trang không phải
    video: extension tự tìm bài viết / reel chứa video **đang phát** (hoặc hiện rõ nhất) để tải; chưa thấy video thì nhắc
    bấm phát video trước. Trang cần đăng nhập dùng phiên đăng nhập sẵn có của trình duyệt (bật/tắt ở thẻ **Cài đặt**;
    cookie chỉ gửi tới bộ tải trên máy, giữ trong bộ nhớ; không áp dụng cho YouTube).
  - **Tệp & luồng video**: video nhúng (YouTube, Vimeo…) trong trang, tệp video/âm thanh trực tiếp và luồng HLS/DASH
    mà trang đang phát (bắt từ mạng sau khi bấm phát).
  - **Ảnh trên trang**: quét mọi ảnh (`img`, `srcset`, ảnh nền CSS, ảnh lười tải, ảnh trong liên kết, ảnh đại diện trang),
    tự đoán **bản lớn nhất** (ảnh bìa YouTube 1280×720, avatar Google bản gốc, Twitter/X `orig`, Pinterest, Wikipedia,
    WordPress, Shopify, CDN có tham số `?w=`…; đoán sai thì tự lùi về ảnh gốc). Chọn nhiều ảnh, lưu dạng **Gốc / PNG / JPG / WebP**.
    Tải nhiều ảnh thì gom vào thư mục mang tên trang.
  - **Ảnh bìa video YouTube** và **chụp khung hình** video đang phát ở độ phân giải gốc (vd. 3840×2160).
  - Trên YouTube còn có nút **Tải về** ngay trên trình phát: Tốt nhất / 1080p / 720p (MP4), âm thanh MP3, ảnh bìa, chụp khung hình.

## Hai phiên bản

| | Bản Chrome Web Store | Bản đầy đủ (GitHub) |
| --- | --- | --- |
| Cài đặt | Từ Chrome Web Store | Load unpacked thư mục mã nguồn (xem bên dưới) |
| Xoay/lật/phóng to, tắt đèn, đèn nền, Rạp phim (YouTube) | Có | Có |
| Cửa sổ nổi, âm lượng từng tab, chụp màn hình, lưu ảnh, chụp khung hình | Có | Có |
| Tải video / âm thanh (yt-dlp), tệp & luồng video, ảnh bìa YouTube | **Không** | Có (cần cài bộ tải trên máy) |

Chính sách Chrome Web Store không cho extension tải video YouTube, nên bản Store được build từ cùng mã nguồn nhưng bỏ
hết phần tải video và các quyền đi kèm (`nativeMessaging`, `cookies`, `webRequest`).

## Cài đặt (chế độ nhà phát triển)

1. Mở Chrome, vào `chrome://extensions`.
2. Bật **Developer mode** (Chế độ dành cho nhà phát triển) ở góc trên bên phải.
3. Bấm **Load unpacked** (Tải tiện ích đã giải nén) và chọn thư mục mã nguồn này (thư mục có `manifest.json`).
4. Mở hoặc **tải lại (F5)** tab YouTube đang mở. Extension chỉ chạy trên các tab mở/tải lại sau khi cài.

Sau khi sửa code: bấm nút ⟳ của extension trong `chrome://extensions`, rồi tải lại tab YouTube.

### Cài bộ tải video (một lần)

Tải video/âm thanh cần yt-dlp + ffmpeg chạy trên máy; extension gọi chúng qua *native messaging*.
Tải ảnh và chụp khung hình **không** cần bước này.

1. Cần Python 3.9+ (`winget install Python.Python.3.12`). Nên có Node.js hoặc Deno (YouTube cần để giải mã).
2. Nạp extension trước (các bước ở trên), rồi bấm đúp `native-host\install.bat`. Trình cài sẽ:
   - cài / cập nhật `yt-dlp[default]` bằng pip, cài ffmpeg bằng winget nếu chưa có;
   - tự tìm ID extension trong Chrome / Edge / Brave / Cốc Cốc và đăng ký bộ nối `com.cinematools.downloader`;
   - tự chạy thử và báo "Hoàn tất".
3. Mở lại popup → thẻ **Tải về**: góc phải hiện phiên bản yt-dlp là xong.

Video lưu vào thư mục **Tải về** (Downloads) của Windows. Muốn đổi, thêm `"downloadDir": "D:\\Video"` vào
`native-host\config.json`. Gỡ: `native-host\uninstall.bat`. Khi YouTube đổi cách phát làm tải lỗi, chạy lại `install.bat`
để cập nhật yt-dlp. Nếu chuyển thư mục extension hoặc nạp ở máy khác, ID extension đổi → chạy lại `install.bat`
(hoặc `install.bat --extension-id <ID>`).

## Cách dùng

| Cách | Mô tả |
| --- | --- |
| Nút trên trình phát | Các nút mới cạnh nút phụ đề: **Tải về**, **Cửa sổ nổi**, **Xoay, lật & phóng to** (mở bảng chọn), **bóng đèn** (tắt/bật đèn), **Rạp phim**. |
| Popup | Bấm biểu tượng extension: nút **Cửa sổ nổi** và **⚙ Cài đặt** (kèm danh sách phím tắt) ở đầu; thẻ **Video** (tắt đèn, Rạp phim, xoay/lật, phóng to & cắt viền — YouTube), **Âm thanh** (âm lượng từng tab), **Tải về**, **Tiện ích** (chụp màn hình). Trang không phải YouTube thì popup tự mở thẻ Âm thanh. |
| Nút **Tải về** trên trình phát | Tải nhanh video / MP3 / ảnh bìa / khung hình của video đang xem, xem tiến độ. |
| Phím tắt | `Alt + Shift +`: `L` tắt/bật đèn · `C` Rạp phim · `H` lật ngang · `V` lật dọc · `E` xoay trái · `R` xoay phải · `A` tự cắt viền · `+` / `−` phóng to / thu nhỏ · `0` đặt lại tất cả · `S` chụp khung hình · `P` cửa sổ nổi. `Esc`: thoát Rạp phim / bật lại đèn. `Alt+P`: cửa sổ nổi ở mọi trang · `Alt+S`: chụp cả trang (đổi ở `chrome://extensions/shortcuts`). |

Ghi chú: trên Windows, `Alt + Shift` cũng là tổ hợp đổi ngôn ngữ bàn phím. Nếu bị đổi bộ gõ khi dùng phím tắt,
có thể đổi phím trong `SHORTCUTS` ở `src/shared/shared.js`. Khi trình phát quá hẹp hoặc đang thu nhỏ,
hai nút trên trình phát được ẩn đi (vẫn dùng được popup và phím tắt).

Cài đặt trong popup: độ tối màn che, bật/tắt đèn nền, độ sáng và độ lan của đèn nền, giữ xoay/lật/phóng to khi
chuyển video (riêng "Tự cắt viền" luôn được bỏ khi đổi video vì viền đen khác nhau), ẩn/hiện nút trên trình phát,
bật/tắt phím tắt.

## Cấu trúc thư mục

```
manifest.json            Khai báo extension (MV3)
icons/                   Biểu tượng 16/32/48/128 px
popup/                   Popup khi bấm biểu tượng extension
  popup.html / .css / .js  Đầu popup (Cửa sổ nổi, ⚙ Cài đặt kèm phím tắt), thẻ Video, thẻ Tiện ích (chụp màn hình)
  audio.js               Thẻ Âm thanh (âm lượng từng tab)
  download.js            Thẻ Tải về (video, luồng, ảnh)
src/shot/                Trang kết quả chụp màn hình: ghép khung, tải PNG/JPG, sao chép
  shot.html / .css / .js
src/shared/shared.js     Dùng chung: cài đặt mặc định, tên thao tác, phím tắt, biểu tượng SVG, mô tả tiến độ tải
src/background/          Service worker
  background.js          Gọi bộ tải yt-dlp, danh sách tải + huy hiệu %, tải ảnh, dò luồng video (webRequest),
                         âm lượng từng tab, phím tắt Alt+P
  offscreen.html / .js   Trang ẩn: tải ảnh, đổi PNG/JPG/WebP, tạo blob để lưu; khuếch đại âm thanh tab (tabCapture)
src/page/                Chèn vào trang (mọi trang) khi cần
  agent.js               Quét ảnh/video/video nhúng/bài viết có video, chụp khung hình (có sẵn trên YouTube)
  pip.js                 Cửa sổ nổi (Picture-in-Picture mặc định của trình duyệt; có sẵn trên YouTube)
  pip-run.js / pip-run-frame.js  Mở cửa sổ nổi ngay trong cùng lần chèn với pip.js
  volume.js              Âm lượng 0–100% cho thẻ <video>/<audio> trong tab
  shot.js                Chụp màn hình: đo trang, cuộn, ẩn thanh dính, lớp chọn vùng, trả trang về như cũ
native-host/             Bộ tải chạy trên máy (Python + yt-dlp)
  host.py                Nhận lệnh từ extension: ping / info / download / reveal / open
  install.py / .bat      Cài thư viện, tìm ffmpeg + node, đăng ký với trình duyệt
  uninstall.bat          Gỡ đăng ký
  (tự tạo khi cài)       config.json, host.bat, com.cinematools.downloader.json, host.log
src/content/             Chạy trong trang YouTube (thứ tự nạp theo manifest)
  core.js                Namespace YTX, cài đặt (chrome.storage.local), bus sự kiện, tiện ích DOM
  transform.js           Xoay/lật/phóng to/di chuyển: trạng thái + biến CSS + tự căn vừa khung
  zoom.js                Dò viền đen, lấp đầy, cắt theo tỉ lệ, kéo để di chuyển
  lights.js              Tắt đèn: màn che, nâng trình phát lên trên (YTX.stack)
  ambient.js             Đèn nền: màu mép loang ra 4 phía (lớp gần + lớp xa), đổi màu chậm và êm
  cinema.js              Chế độ Rạp phim
  download.js            Nút & bảng "Tải về" trên trình phát
  floating.js            Cửa sổ nổi trên YouTube: nút, phím tắt, tự mở khi chuyển tab
  ui.js                  Nút trên thanh điều khiển, bảng chọn xoay/lật, thông báo nhanh
  shortcuts.js           Phím tắt
  main.js                Danh sách thao tác, theo dõi chuyển trang, nhận lệnh từ popup
  content.css            Toàn bộ giao diện trong trang
```

## Ghi chú kỹ thuật (để phát triển tiếp)

- **Thêm tính năng mới**: tạo file trong `src/content/`, gắn vào `globalThis.YTX`, thêm vào danh sách `js`
  trong `manifest.json` (trước `main.js`). Thao tác mới đăng ký trong `YTX.actions` (main.js) thì dùng
  được ngay cho nút, phím tắt và popup qua `YTX.run('tênThaoTác')`. Tên hiển thị thêm vào `LABELS` trong `shared.js`.
- **Xoay/lật/phóng to**: CSS áp dụng `translate(tx, ty) scale(fx·k·z, fy·k·z) rotate(r)` lên thẻ `<video>`.
  Phép lật đặt ngoài phép xoay nên "lật ngang" luôn lật theo màn hình. `k` giữ video xoay ngang vừa khung, `z` là
  hệ số phóng (lấp đầy vùng cắt × phóng tay). Đèn nền lấy `YTX.transform.view()` để vẽ đúng phần hình đang thấy.
  Không sửa style inline của video vì YouTube ghi đè liên tục.
- **Tắt đèn**: màn che `z-index: 2100` (thanh tiêu đề YouTube là 2020), đèn nền 2101, trình phát 2102.
  YouTube gắn `view-transition-name` cho khung chứa trình phát, tạo lớp xếp chồng riêng; `lights.js` tự dò
  các lớp cha kiểu này mỗi giây và xử lý, nên vẫn chạy khi YouTube đổi bố cục (chế độ rạp…).
- **YouTube là ứng dụng một trang**: dùng sự kiện `yt-navigate-finish` và kiểm tra định kỳ 1 giây để gắn lại
  nút khi YouTube dựng lại thanh điều khiển.
- Không dùng `innerHTML` (YouTube bật Trusted Types); tạo phần tử bằng `YTX.h()` và `createIcon()`.
- **Tải video**: popup / trình phát → service worker → `chrome.runtime.connectNative('com.cinematools.downloader')`
  → `host.bat` → `host.py` (gọi thẳng thư viện `yt_dlp`). Mỗi lượt tải là một tiến trình riêng, gửi tiến độ liên tục; huỷ hoặc
  đóng kết nối thì xoá tệp tải dở. Bộ nối chỉ nhận lựa chọn hợp lệ (chế độ, độ phân giải, MP4/WebM/MKV, MP3/M4A/Opus)
  và vài header (Referer, User-Agent, Origin); không bao giờ truyền tham số tuỳ ý cho yt-dlp. Định dạng chọn bằng
  `format_sort`: MP4 `res:N, vcodec:h264, acodec:aac` (≤1080p ra H.264; 4K của YouTube chỉ có VP9/AV1),
  WebM `vcodec:vp9, acodec:opus`, MKV lấy codec tốt nhất. Mở tệp / thư mục chỉ cho phép tệp nằm trong thư mục tải về.
  Nhật ký gỡ lỗi: `native-host\host.log`.
- **Ảnh**: service worker không tạo được blob URL nên việc đổi định dạng làm trong trang offscreen. Địa chỉ "bản lớn hơn"
  chỉ là đoán: thử lần lượt, bỏ nếu lỗi hoặc nhỏ hơn ảnh đang thấy. Máy chủ chặn thì để trình duyệt tự tải bản gốc.
- **Cửa sổ nổi**: `video.requestPictureInPicture()` (cửa sổ mặc định của trình duyệt, bỏ `disablePictureInPicture`
  của trang nếu có). Trình duyệt chỉ cho mở ngay sau thao tác của người dùng, nên popup / Alt+P chèn `pip.js` +
  `pip-run.js` trong **một** lần `executeScript`; trang chính không có video thì thử các khung con (video nhúng).
  Tự mở khi chuyển tab: đăng ký thao tác `enterpictureinpicture` của Media Session (Chrome có thể hỏi cho phép lần đầu).
- **Âm lượng từng tab**: ≤100% nhân hệ số vào `volume` của từng thẻ media (ghi nhận khi trang tự đổi âm lượng, áp cho
  thẻ mới qua MutationObserver). >100%: `chrome.tabCapture.getMediaStreamId` (chỉ được với tab vừa mở popup) →
  offscreen `getUserMedia` → GainNode → DynamicsCompressor (chặn đỉnh) → loa. Khi đang bắt âm thanh, Chrome hiện biểu
  tượng "đang chia sẻ" trên tab; đặt lại (bấm đúp thanh âm lượng) để dừng.
- **Chụp màn hình**: service worker gọi `src/page/shot.js` để cuộn tức thì từng màn hình (bỏ qua cuộn mượt, ẩn thanh
  cuộn), chụp bằng `chrome.tabs.captureVisibleTab` (Chrome giới hạn 2 lần/giây nên cách nhau 0,55 giây), sau khung đầu
  ẩn phần tử `fixed`/`sticky`. Đo lại chiều cao sau mỗi khung (trang dài thêm khi ảnh lười tải); tối đa 40 khung. Các
  khung giữ trong bộ nhớ service worker; trang `src/shot/shot.html#id` lấy từng khung, ghép theo vị trí cuộn × tỉ lệ
  điểm ảnh, thu nhỏ nếu vượt giới hạn canvas (~32 000 px). Chuyển tab giữa chừng thì dừng và trả trang về như cũ.

## Giới hạn hiện tại

- Chỉ áp dụng cho trang xem video (`/watch`). Shorts dùng trình phát khác, chưa hỗ trợ.
- Tắt đèn không có tác dụng ở chế độ toàn màn hình (toàn màn hình vốn đã chỉ hiện video); xoay/lật vẫn chạy.
- Video có DRM (phim thuê/mua) có thể cho đèn nền màu đen vì trình duyệt không cho vẽ khung hình.
- Tải về: video có DRM (Netflix, phim thuê…) và buổi phát trực tiếp đang diễn ra không tải được. Video cần đăng nhập
  (riêng tư, hội viên) có thể bị từ chối vì yt-dlp không dùng cookie của trình duyệt. Chụp khung hình không được với video
  từ nguồn khác chặn đọc điểm ảnh. Bộ tải hiện viết cho Windows.
- Để tải về, extension xin thêm quyền đọc mọi trang (`<all_urls>`), `downloads`, `nativeMessaging`, `webRequest`,
  `scripting`, `offscreen`, `cookies`; cho âm lượng thêm `tabCapture`, `activeTab`.
- Âm lượng 0–100% chỉ tác động thẻ `<video>`/`<audio>`; âm thanh tạo bằng Web Audio (một số game, trang nhạc) chỉ tắt
  tiếng được, hoặc dùng tăng âm (tabCapture) ở tab đang mở popup. Tăng quá 100% chỉ bật được cho tab đang mở popup.
- Cửa sổ nổi chỉ có các nút mặc định của trình duyệt (không có tua, tốc độ). Alt+P trên trang không có video sẽ hiện
  dấu "!" trên biểu tượng.
- Chụp cả trang chỉ cuộn khung trang chính: trang tự cuộn trong một khung riêng (Gmail, nhiều ứng dụng web) chỉ chụp
  được phần đang thấy. Trang cuộn vô tận dừng ở 40 màn hình. Không chụp được trang hệ thống (chrome://, Cửa hàng Chrome).

## Hướng phát triển

- Hỗ trợ Shorts và video nhúng.
- Chỉnh độ sáng/tương phản video, chế độ tập luyện (lặp đoạn A–B, tốc độ tuỳ ý).
- Tự tắt đèn khi bấm phát, lưu hướng xoay riêng cho từng video.

## Build & phát hành bản cập nhật

Cần Node.js 22 trở lên, không cần `npm install`.

```bash
node tools/build.mjs store --zip    # dist/store/ + dist/cinema-tools-store-v<phiên bản>.zip (tải lên Chrome Web Store)
node tools/build.mjs full --zip     # dist/full/ + ZIP bản đầy đủ (đính kèm bản phát hành GitHub)
```

- Phần chỉ có ở bản đầy đủ được đánh dấu ngay trong mã nguồn: `// #full-start` … `// #full-end` (JS/CSS),
  `<!-- #full-start -->` … `<!-- #full-end -->` (HTML). Phần chỉ có ở bản Store viết trong chú thích
  `/* #store-start … #store-end */` hoặc `<!-- #store-start … #store-end -->`. Code mới liên quan tới tải video phải
  nằm trong khối `full`. Build bản Store tự báo lỗi nếu còn sót `yt-dlp`, `nativeMessaging`, `chrome.cookies`,
  `chrome.webRequest`…
- Mỗi lần cập nhật: tăng `version` trong `manifest.json` → build ZIP → Chrome Web Store Developer Dashboard → mục
  extension → **Package** → **Upload new package** → **Submit for review**. Mỗi bản cập nhật đều phải qua duyệt lại.
- Tên, mô tả và danh sách quyền của bản Store nằm trong `STORE_MANIFEST` / `STORE_DROP_PERMISSIONS` ở `tools/build.mjs`.
  Thêm quyền mới thì phải cập nhật phần giải thích quyền và [PRIVACY.md](PRIVACY.md).

## Giấy phép

[MIT](LICENSE). Chính sách quyền riêng tư: [PRIVACY.md](PRIVACY.md).
