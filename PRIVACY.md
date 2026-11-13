# Chính sách quyền riêng tư – Cinema Tools

*Có hiệu lực từ: 08/11/2026 · Cập nhật: 13/11/2026 (thêm Xem trước khi chia sẻ) · English version below*

Cinema Tools là extension Chrome mã nguồn mở (https://github.com/2108win/youtuw). Extension **không thu thập, không gửi
đi và không bán** bất kỳ dữ liệu nào của bạn. Không có máy chủ, không có phân tích (analytics), không có quảng cáo,
không tải mã từ xa.

## Dữ liệu được xử lý (chỉ trên máy của bạn)

| Dữ liệu | Dùng để | Lưu ở đâu, bao lâu |
| --- | --- | --- |
| Cài đặt (độ tối, đèn nền, phím tắt…) | Ghi nhớ lựa chọn của bạn | `chrome.storage.local` trên máy, tới khi bạn gỡ extension hoặc bấm "Khôi phục cài đặt mặc định" |
| Mức âm lượng từng tab | Giữ âm lượng khi trang tải lại | Bộ nhớ phiên của trình duyệt, xoá khi đóng tab / trình duyệt |
| Tiêu đề, địa chỉ, biểu tượng của các tab đang phát âm thanh | Hiện danh sách trong thẻ Âm thanh để chỉnh âm lượng từng tab | Chỉ đọc khi bạn mở popup; không lưu |
| Nội dung trang đang mở (trình phát YouTube, thẻ video/âm thanh, danh sách ảnh) | Xoay/lật/phóng to video, tắt đèn, cửa sổ nổi, chỉnh âm lượng, tìm ảnh để lưu | Chỉ đọc trong tab khi bạn dùng tính năng; không lưu lại |
| Ảnh chụp màn hình, khung hình video | Hiện cho bạn xem và lưu | Trong bộ nhớ tới khi bạn đóng trang kết quả; tệp chỉ lưu khi bạn bấm Tải / Chụp |
| Âm thanh của tab (chỉ khi bạn kéo âm lượng quá 100%) | Khuếch đại âm thanh ngay trên máy | Không ghi âm, không lưu; dừng khi bạn đặt lại âm lượng hoặc đóng tab |
| Thẻ `<head>` (tiêu đề, mô tả, thẻ Open Graph…) và địa chỉ của trang bạn bấm "Kiểm tra trang này" hoặc gõ vào trang báo cáo | Xem trước khi chia sẻ: mô phỏng thẻ liên kết trên mạng xã hội, chấm điểm, gợi ý sửa | Chỉ trong trang báo cáo tới khi bạn đóng nó; không lưu |

Khi bạn lưu ảnh từ một trang, trình duyệt tải ảnh **trực tiếp từ trang web chứa ảnh** (giống thao tác "Lưu ảnh"), rồi
lưu vào thư mục Tải về của bạn. Lần tải đầu không kèm cookie; chỉ khi máy chủ yêu cầu đăng nhập mới thử lại kèm phiên
đăng nhập sẵn có của trình duyệt với trang đó. Extension không gửi địa chỉ trang hay ảnh tới bên nào khác.

Khi bạn dùng **Xem trước khi chia sẻ** (bấm "Kiểm tra trang này" trên một tab, hoặc gõ một địa chỉ vào trang báo cáo),
extension đọc thẻ `<head>` của tab đó (nếu có) và tải lại địa chỉ trang **một lần, không kèm cookie**, giống máy quét của
mạng xã hội; rồi tải ảnh chia sẻ và biểu tượng mà trang khai báo, từ máy chủ chứa chúng (có thể là máy chủ khác, vd. CDN).
Lưu ý:
- Tải lại trang là một yêu cầu GET mới: liên kết dùng một lần (đăng nhập bằng link, xác nhận email…) có thể bị dùng mất.
  Máy chủ có thể nhận ra yêu cầu đến từ một extension.
- Extension không tự tải ảnh / biểu tượng ở địa chỉ mạng nội bộ (localhost, IP nội bộ, tên máy trong mạng LAN) khi trang
  đang kiểm tra là trang công khai. Việc nhận diện dựa trên tên máy trong địa chỉ. Nếu ảnh công khai **chuyển hướng** tới
  địa chỉ nội bộ, extension dừng và không đọc nội dung, nhưng yêu cầu tới đó có thể đã được gửi đi.
- Không dùng được trong cửa sổ ẩn danh.
- Kết quả chỉ hiện trên máy, không lưu lại, không gửi tới bên nào khác. Liên kết tới công cụ kiểm tra của Facebook /
  LinkedIn / Google trong trang báo cáo chỉ mở khi bạn tự bấm (khi đó địa chỉ trang được gửi tới công cụ bạn chọn).

Việc sử dụng dữ liệu của Cinema Tools tuân thủ Chính sách dữ liệu người dùng của Chrome Web Store, kể cả các yêu cầu Limited
Use.

## Bản đầy đủ trên GitHub (cài thủ công)

Bản đầy đủ (không có trên Chrome Web Store) có thêm tải video qua công cụ yt-dlp **chạy trên máy của bạn**. Khi bạn bấm
tải, địa chỉ trang và (nếu bạn bật) cookie đăng nhập của đúng trang đó được gửi tới bộ tải trên máy qua native messaging;
yt-dlp tải video trực tiếp từ trang web đó. Không có dữ liệu nào gửi tới nhà phát triển. Nhật ký gỡ lỗi
`native-host/host.log` chỉ nằm trên máy bạn.

## Liên hệ

Câu hỏi hoặc báo lỗi: https://github.com/2108win/youtuw/issues

---

# Privacy Policy – Cinema Tools

*Effective: 8 November 2026 · Updated: 13 November 2026 (added Share preview)*

Cinema Tools is an open-source Chrome extension (https://github.com/2108win/youtuw). It **does not collect, transmit or
sell** any user data. There is no server, no analytics, no advertising and no remotely hosted code.

**Processed locally only:**

- **Settings** (dimming level, ambient light, shortcuts…) are saved in `chrome.storage.local` on your device until you
  uninstall the extension or reset settings.
- **Per-tab volume levels** are kept in the browser's session storage and cleared when the tab or browser closes.
- **Titles, URLs and icons of tabs playing audio** are read only while the popup is open, to list them in the volume
  mixer. They are not stored.
- **Page content** (the YouTube player, `<video>`/`<audio>` elements, the list of images on a page) is read inside the
  tab only when you use a feature (rotate/zoom, lights off, Picture-in-Picture, volume, saving images). Nothing is stored.
- **Screenshots and video frames** stay in memory until you close the result page; files are written to your Downloads
  folder only when you click save.
- **Tab audio** is captured only when you raise a tab's volume above 100%, is amplified locally, and is never recorded
  or stored.

When you save images, the browser downloads them directly from the website that hosts them, like "Save image as". The
first request is sent without cookies; it is retried with the browser's existing session for that site only if the
server requires it.

When you use **Share preview** ("Check this page" on a tab, or an address you type into the report page), the extension
reads that tab's `<head>` tags (if any) and re-fetches the page URL **once, without cookies**, like a social-media
crawler; it then fetches the share image and favicon the page declares from the servers that host them (possibly other
servers, e.g. a CDN). Notes:
- The re-fetch is a new GET request, so a one-time link (magic sign-in link, email confirmation…) may be used up. Servers
  may be able to tell the request comes from an extension.
- For public pages, images and icons declared at private-network addresses (localhost, private IPs, LAN host names) are
  not fetched. Detection is based on the host name in the address. If a public image **redirects** to a private address,
  the extension stops without reading it, but the request may already have been sent.
- Not available in incognito windows.
- Results are shown on your device only, are not stored and are not sent anywhere else. Links to the Facebook /
  LinkedIn / Google checking tools in the report open only when you click them (the page URL is then sent to the tool
  you chose).

The use of information received by Cinema Tools adheres to the Chrome Web Store User Data Policy, including the Limited
Use requirements.

**Full edition (GitHub, manual install, not on the Chrome Web Store):** adds video download through yt-dlp running on
your own computer. The page URL and, if you enable it, that site's login cookies are passed to the local helper via
native messaging; yt-dlp downloads from that website directly. Nothing is sent to the developer.

**Contact:** https://github.com/2108win/youtuw/issues
