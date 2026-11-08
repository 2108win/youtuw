# Rà soát bảo mật / quyền riêng tư / chính sách – bản Store 1.3.0

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
