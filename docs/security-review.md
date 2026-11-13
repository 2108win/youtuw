# Rà soát bảo mật / quyền riêng tư / chính sách – bản Store

## Bản 1.4.0 – "Xem trước khi chia sẻ" (13/11/2026)

Rà soát độc lập (agent `security-reviewer`, chỉ đọc) trên `dist/store` 1.4.0 (ZIP SHA-256 `5e489b7f…f292`, 41 tệp).
Sau đó đã sửa và kiểm tra lại trên ZIP SHA-256 `2558c9d785bf561c728cac33e95548756bf00f39e938a084744b2e98fd51e055`
(42 tệp).

### Kết luận của bản rà soát

- So với 1.3.0, chỉ thêm `src/share/`, thẻ trong popup, biểu tượng, version, mô tả. B1–B3, W1–W6 không bị đảo ngược.
- `share.html` không web-accessible, không có `externally_connectable` / `onMessageExternal`: trang web không mở hay
  điều khiển được trang báo cáo. `#tab=` chỉ dẫn tới `executeScript` một hàm trong gói, chỉ đọc, chỉ khung chính.
- Không `innerHTML` / `eval` / `new Function` / `document.write` / `srcdoc`; nội dung trang chỉ gán qua `textContent` /
  thuộc tính cố định; liên kết chỉ `https?:`; fetch `credentials: 'omit'`, `no-referrer`, có giới hạn dung lượng / thời gian.

### Các điểm và cách xử lý

| Mã | Mức | Nội dung | Xử lý |
| --- | --- | --- | --- |
| S1 | Vừa (nghi ngờ, có thể thành Chặn) | Ảnh / biểu tượng SVG do trang khai báo được tạo blob URL `image/svg+xml` trong origin của extension và hiện bằng `<img>`; mở ảnh ở tab mới có thể thành tài liệu SVG chạy trong origin extension. Type còn có thể lấy từ content-type của máy chủ | **Đã sửa**: chỉ tạo blob cho ảnh raster nhận ra qua nội dung (JPEG/PNG/GIF/WebP/AVIF/BMP/ICO) và giải mã được; không dùng content-type máy chủ làm type; SVG chỉ hiện chữ. Kiểm tra: trang mẫu có og:image và favicon SVG chứa `<script>` → không có `blob:` nào kiểu SVG |
| P1 | Chặn (chính sách) – chủ sở hữu quyết | Single purpose: thêm công cụ kiểm tra Open Graph / SEO vào extension "Công cụ xem video" làm tăng rủi ro W4 | Người dùng chọn giữ trong bản Store. Khuyến nghị trong `docs/release.md`: **chờ 1.3.0 được duyệt rồi mới gửi 1.4.0**, không huỷ lượt duyệt 1.3.0; phương án lùi: bỏ tính năng khỏi bản Store |
| D1 | Vừa | Trang báo cáo tải được địa chỉ người dùng gõ vào, và ảnh / biểu tượng từ máy chủ khác; PRIVACY và giải thích `<all_urls>` chỉ nói "trang này" | **Đã sửa tài liệu**: PRIVACY (VI + EN), giải thích `<all_urls>`, hướng dẫn cho người duyệt nhắc ô nhập địa chỉ và máy chủ ảnh |
| S2 | Thấp | Chặn mạng nội bộ bỏ sót `localhost.` (dấu chấm cuối), tên một nhãn, `.lan` / `home.arpa`, 100.64/10, fe80::/10 đầy đủ, fec0::; chuyển hướng tới địa chỉ nội bộ chỉ bị phát hiện sau khi yêu cầu đã gửi. Cùng lỗi dấu chấm cuối ở `offscreen.js` (W2) | **Đã sửa**: bộ lọc chung `src/shared/net.js` cho cả trang báo cáo và `offscreen.js` (25 ca thử đạt; lưu ảnh từ `http://router/`, `http://localhost./` bị từ chối). Giới hạn còn lại (tên miền công khai trỏ về IP nội bộ; yêu cầu chuyển hướng đã gửi trước khi dừng) ghi rõ trong PRIVACY |
| P2 | Thấp | Listing, popup, hướng dẫn người duyệt liệt kê 7 thương hiệu (dễ bị coi là nhồi từ khoá) | **Đã sửa**: popup, mô tả chi tiết, hướng dẫn người duyệt chỉ ghi "mạng xã hội và Google" |
| P3 | Thông tin | Khung xem trước bắt chước bố cục thẻ của nền tảng (không logo) | **Đã sửa**: thêm câu không liên kết trong trang báo cáo và cuối mô tả chi tiết |
| I1 | Thấp | Tiêu đề tab báo cáo chứa tiêu đề trang được kiểm tra, `#url=` chứa địa chỉ: nằm lại trong lịch sử; mở từ tab ẩn danh thì vào lịch sử cửa sổ thường | **Đã sửa**: tiêu đề tab chỉ còn điểm; không ghi `#url=` lên thanh địa chỉ; popup từ chối tab ẩn danh |
| I2 | Thông tin | Tải lại trang là GET mới (link dùng một lần có thể bị dùng mất); máy chủ có thể nhận ra extension | **Ghi rõ** trong PRIVACY và trong trang báo cáo |
| I3 | Thông tin | Bộ thẻ gợi ý có thể dùng lại `javascript:` / `data:` từ canonical, og:url, og:image; liên kết công cụ kiểm tra dùng og:url do trang chọn | **Đã sửa**: chỉ nhận địa chỉ http(s); liên kết công cụ dùng địa chỉ đang kiểm tra |
| I4 | Thông tin | Ảnh "bom giải nén"; lượt tải cũ không bị huỷ khi kiểm tra trang khác | **Đã sửa**: không hiện ảnh hỏng hoặc trên ~50 triệu điểm ảnh; huỷ lượt tải cũ bằng AbortController |
| L1 | Thấp (có từ trước) | PRIVACY thiếu câu tuân thủ Limited Use | **Đã sửa**: thêm câu (VI + EN) |

Chưa kiểm được: Chrome có cho tài liệu blob kế thừa CSP của extension không (S1 đã loại bỏ đường này nên không còn phụ
thuộc); Local Network Access có miễn cho extension không; hành vi thật khi mở từ tab ẩn danh (đã chặn ở popup). Bản đã
sửa chưa được rà soát độc lập lần hai.

## Bản 1.3.0

Rà soát độc lập (agent `security-reviewer`, chỉ đọc) trên `dist/store` ngày 08/11/2026, trước khi gửi Chrome Web Store.
Sau đó đã sửa và kiểm tra lại trên ZIP SHA-256 `663042d2206b2d73ac93c99c936d62ddadf4545757956464a2a5aea65f33a488`.

## Kết luận của bản rà soát

- Code thực sự chạy trong bản Store **không** tải video hay âm thanh. Âm thanh tab chỉ đi
  nguồn → gain → limiter → loa, không ghi lại. Không có native host.
- Không có mã từ xa (`eval`, `new Function`), không `innerHTML`, không khoá bí mật, không analytics, CSP mặc định của MV3.
- Mọi yêu cầu mạng chỉ tới trang web chứa ảnh mà người dùng chọn lưu; không gửi gì tới nhà phát triển.

## Các điểm và cách xử lý

| Mã | Mức | Nội dung | Xử lý |
| --- | --- | --- | --- |
| B1 | Chặn | Bản Store còn sót chú thích, CSS (`.ytx-dl-*`, `.jobs`, `.streams`, hướng dẫn cài bộ tải), biểu tượng và hàm định dạng tiến độ của phần tải video; người duyệt đọc code sẽ thấy dấu vết công cụ tải | **Đã sửa**: bọc thêm vào khối `full` (CSS popup & trình phát, trạng thái video trong popup, các chỗ quét video/nhúng trong `agent.js`, biểu tượng video/nhạc/luồng, `fmt`, `dlCookies`) |
| B2 | Chặn | Nút lưu ảnh "Gốc" có thể lưu tệp bất kỳ (`.mp4`, `.exe`, `.html`) nếu trang khai báo nó làm ảnh | **Đã sửa**: đường dự phòng chỉ lưu khi phần mở rộng là ảnh; offscreen chỉ đặt phần mở rộng ảnh. Kiểm tra: bản cũ tải `video.mp4`, bản mới từ chối |
| B3 | Chặn | Cần URL chính sách quyền riêng tư và khai báo dữ liệu (kể cả xử lý cục bộ) | **Đã có**: `PRIVACY.md` (HTTP 200 trên GitHub). Khai báo Website content + Web history trong `docs/release.md` |
| W1 | Vừa/thấp | Service worker nhận mọi lệnh từ content script trên youtube.com; offscreen không kiểm tra người gửi | **Đã sửa**: content script chỉ được gọi danh sách lệnh cho phép (bản Store: không lệnh nào); offscreen chỉ nhận từ trang của extension, không từ tab |
| W2 | Thấp/vừa | Tải ảnh kèm cookie, kể cả tới localhost / IP nội bộ, không giới hạn dung lượng | **Đã sửa**: lần đầu không kèm cookie (chỉ thử lại kèm cookie khi 401/403), chặn localhost / IP nội bộ / link-local, giới hạn 50 MB |
| W3 | Thông tin | Cảnh báo khi cài: `<all_urls>` hiện "Đọc và thay đổi mọi dữ liệu của bạn trên mọi trang web". Theo bản rà soát, `tabCapture` cũng kéo theo cảnh báo này (chưa kiểm chứng), nên chỉ chuyển host sang optional chưa chắc làm nhẹ được lời cảnh báo | Giữ nguyên, ghi vào rủi ro trong `docs/release.md` |
| W4 | Vừa/cao | Single purpose: phần lưu ảnh trên trang lệch mục đích nhất | Theo lựa chọn của người dùng vẫn giữ; viết lại mục đích liệt kê đủ tính năng; phương án dự phòng trong `docs/release.md` |
| W5 | Thấp | Thiếu `minimum_chrome_version` (offscreen dùng luồng tabCapture cần Chrome 116) | **Đã sửa**: `"minimum_chrome_version": "116"` |
| W6 | Thấp | `pip.js` bỏ qua `disablePictureInPicture` của trang (tính năng có chủ đích); bộ lọc tên tệp chưa bỏ ký tự bidi/zero-width trong `shot.js` / `agent.js`; tab ẩn danh có thể hiện trong bộ trộn nếu người dùng cho phép chạy ẩn danh | Chưa sửa (ưu tiên thấp) |
