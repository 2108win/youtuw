# Chính sách quyền riêng tư – Cinema Tools

*Có hiệu lực từ: 08/11/2026 · English version below*

Cinema Tools là extension Chrome mã nguồn mở (https://github.com/2108win/youtuw). Extension **không thu thập, không gửi
đi và không bán** bất kỳ dữ liệu nào của bạn. Không có máy chủ, không có phân tích (analytics), không có quảng cáo,
không tải mã từ xa.

## Dữ liệu được xử lý (chỉ trên máy của bạn)

| Dữ liệu | Dùng để | Lưu ở đâu, bao lâu |
| --- | --- | --- |
| Cài đặt (độ tối, đèn nền, phím tắt…) | Ghi nhớ lựa chọn của bạn | `chrome.storage.local` trên máy, tới khi bạn gỡ extension hoặc bấm "Khôi phục cài đặt mặc định" |
| Mức âm lượng từng tab | Giữ âm lượng khi trang tải lại | Bộ nhớ phiên của trình duyệt, xoá khi đóng tab / trình duyệt |
| Nội dung trang đang mở (trình phát YouTube, thẻ video/âm thanh, danh sách ảnh) | Xoay/lật/phóng to video, tắt đèn, cửa sổ nổi, chỉnh âm lượng, tìm ảnh để lưu | Chỉ đọc trong tab khi bạn dùng tính năng; không lưu lại |
| Ảnh chụp màn hình, khung hình video | Hiện cho bạn xem và lưu | Trong bộ nhớ tới khi bạn đóng trang kết quả; tệp chỉ lưu khi bạn bấm Tải / Chụp |
| Âm thanh của tab (chỉ khi bạn kéo âm lượng quá 100%) | Khuếch đại âm thanh ngay trên máy | Không ghi âm, không lưu; dừng khi bạn đặt lại âm lượng hoặc đóng tab |

Khi bạn lưu ảnh từ một trang, trình duyệt tải ảnh **trực tiếp từ trang web chứa ảnh** (giống thao tác "Lưu ảnh"), rồi
lưu vào thư mục Tải về của bạn. Extension không gửi địa chỉ trang hay ảnh tới bên nào khác.

## Bản đầy đủ trên GitHub (cài thủ công)

Bản đầy đủ (không có trên Chrome Web Store) có thêm tải video qua công cụ yt-dlp **chạy trên máy của bạn**. Khi bạn bấm
tải, địa chỉ trang và (nếu bạn bật) cookie đăng nhập của đúng trang đó được gửi tới bộ tải trên máy qua native messaging;
yt-dlp tải video trực tiếp từ trang web đó. Không có dữ liệu nào gửi tới nhà phát triển. Nhật ký gỡ lỗi
`native-host/host.log` chỉ nằm trên máy bạn.

## Liên hệ

Câu hỏi hoặc báo lỗi: https://github.com/2108win/youtuw/issues

---

# Privacy Policy – Cinema Tools

*Effective: 8 November 2026*

Cinema Tools is an open-source Chrome extension (https://github.com/2108win/youtuw). It **does not collect, transmit or
sell** any user data. There is no server, no analytics, no advertising and no remotely hosted code.

**Processed locally only:**

- **Settings** (dimming level, ambient light, shortcuts…) are saved in `chrome.storage.local` on your device until you
  uninstall the extension or reset settings.
- **Per-tab volume levels** are kept in the browser's session storage and cleared when the tab or browser closes.
- **Page content** (the YouTube player, `<video>`/`<audio>` elements, the list of images on a page) is read inside the
  tab only when you use a feature (rotate/zoom, lights off, Picture-in-Picture, volume, saving images). Nothing is stored.
- **Screenshots and video frames** stay in memory until you close the result page; files are written to your Downloads
  folder only when you click save.
- **Tab audio** is captured only when you raise a tab's volume above 100%, is amplified locally, and is never recorded
  or stored.

When you save images, the browser downloads them directly from the website that hosts them, like "Save image as".

**Full edition (GitHub, manual install, not on the Chrome Web Store):** adds video download through yt-dlp running on
your own computer. The page URL and, if you enable it, that site's login cookies are passed to the local helper via
native messaging; yt-dlp downloads from that website directly. Nothing is sent to the developer.

**Contact:** https://github.com/2108win/youtuw/issues
