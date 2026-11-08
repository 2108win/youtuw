#!/usr/bin/env python3
"""
Bộ nối (native messaging host) giữa extension Cinema Tools và yt-dlp.

Chrome chạy host.bat -> python host.py. Giao tiếp qua stdin/stdout:
mỗi tin nhắn = 4 byte độ dài (little-endian) + JSON UTF-8.

Lệnh nhận được (trường "cmd"):
  ping      -> phiên bản yt-dlp, có ffmpeg không, thư mục lưu
  info      -> thông tin video + các độ phân giải có sẵn (không tải)
  download  -> tải; gửi liên tục {"type": "progress" | "status" | "done" | "error"}
               (trong lúc tải có thể nhận thêm {"cmd": "cancel"})
  reveal    -> mở thư mục chứa tệp đã tải (chọn sẵn tệp)
  open      -> mở tệp đã tải bằng ứng dụng mặc định

Chỉ nhận lựa chọn trong danh sách cố định; không bao giờ truyền tham số tuỳ ý cho yt-dlp.
"""
import glob
import http.cookiejar
import json
import os
import re
import struct
import subprocess
import sys
import threading
import time
import traceback

VERSION = '1.0.0'
HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(HERE, 'config.json')
LOG_PATH = os.path.join(HERE, 'host.log')
MAX_IN = 1 << 20  # tin nhắn từ extension không cần lớn hơn 1 MB

# ---- Kênh với Chrome --------------------------------------------------------------
# stdout gốc chỉ dành cho giao thức. Mọi print khác (kể cả của thư viện) chuyển sang stderr.
if sys.platform == 'win32':
    import msvcrt
    msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)
    msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)
_IN = sys.stdin.buffer
_OUT = sys.stdout.buffer
sys.stdout = sys.stderr
_send_lock = threading.Lock()


def send(obj):
    data = json.dumps(obj, ensure_ascii=False).encode('utf-8')
    with _send_lock:
        try:
            _OUT.write(struct.pack('<I', len(data)))
            _OUT.write(data)
            _OUT.flush()
        except OSError:
            pass  # Chrome đã đóng kết nối


def read_message():
    raw = _IN.read(4)
    if len(raw) < 4:
        return None
    size = struct.unpack('<I', raw)[0]
    if size > MAX_IN:
        return None
    data = _IN.read(size)
    if len(data) < size:
        return None
    return json.loads(data.decode('utf-8'))


# ---- Nhật ký (để gỡ lỗi) ---------------------------------------------------------
_log_lock = threading.Lock()


def log(*parts):
    try:
        with _log_lock:
            if os.path.exists(LOG_PATH) and os.path.getsize(LOG_PATH) > 512 * 1024:
                os.replace(LOG_PATH, LOG_PATH + '.old')
            with open(LOG_PATH, 'a', encoding='utf-8') as f:
                f.write(time.strftime('%Y-%m-%d %H:%M:%S ') + ' '.join(str(p) for p in parts) + '\n')
    except OSError:
        pass


class YtdlpLogger:
    """Nhận log của yt-dlp: ghi ra tệp, giữ lỗi cuối cùng để báo cho người dùng."""

    def __init__(self):
        self.last_error = ''

    def debug(self, msg):
        if not msg.startswith('[debug] '):
            log('[yt-dlp]', msg)

    def info(self, msg):
        log('[yt-dlp]', msg)

    def warning(self, msg):
        log('[yt-dlp] WARNING', msg)

    def error(self, msg):
        self.last_error = msg
        log('[yt-dlp] ERROR', msg)


# ---- Cấu hình -----------------------------------------------------------------------
def load_config():
    try:
        with open(CONFIG_PATH, encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def downloads_dir(cfg):
    custom = cfg.get('downloadDir')
    if custom and os.path.isdir(custom):
        return custom
    if sys.platform == 'win32':
        try:
            import winreg
            key = r'Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders'
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key) as k:
                value, _ = winreg.QueryValueEx(k, '{374DE290-123F-4565-9164-39C4925E467B}')
            path = os.path.expandvars(value)
            if os.path.isdir(path):
                return path
        except OSError:
            pass
    path = os.path.join(os.path.expanduser('~'), 'Downloads')
    os.makedirs(path, exist_ok=True)
    return path


def ffmpeg_path(cfg):
    path = cfg.get('ffmpeg')
    if path and os.path.exists(path):
        return path
    from shutil import which
    found = which('ffmpeg')
    if found:
        return found
    # winget nâng cấp ffmpeg thì thư mục có số phiên bản đổi -> tìm lại bản mới nhất
    local = os.environ.get('LOCALAPPDATA', '')
    for pattern in (r'Microsoft\WinGet\Packages\Gyan.FFmpeg*\*\bin\ffmpeg.exe',
                    r'Microsoft\WinGet\Packages\*FFmpeg*\*\bin\ffmpeg.exe'):
        hits = sorted(glob.glob(os.path.join(local, pattern)), reverse=True)
        if hits:
            return hits[0]
    return None


# ---- Kiểm tra dữ liệu vào ---------------------------------------------------------
CONTAINERS = {'mp4', 'webm', 'mkv'}
AUDIO_FORMATS = {'mp3', 'm4a', 'opus'}
HEADER_KEYS = {'Referer', 'User-Agent', 'Origin'}


class BadRequest(Exception):
    pass


def valid_url(url):
    if not isinstance(url, str) or len(url) > 4096 or not re.match(r'^https?://[^\s]+$', url):
        raise BadRequest('Địa chỉ trang không hợp lệ.')
    return url


def valid_headers(headers):
    out = {}
    if not isinstance(headers, dict):
        return out
    for key, value in headers.items():
        if key in HEADER_KEYS and isinstance(value, str) and len(value) <= 2048 and not re.search(r'[\r\n]', value):
            out[key] = value
    return out


COOKIE_DOMAIN = re.compile(r'^\.?[a-z0-9-]+(\.[a-z0-9-]+)+$', re.I)
COOKIE_BAD = re.compile(r'[\x00-\x1f\x7f;]')


def valid_cookies(items):
    """Cookie trình duyệt gửi kèm (để tải video cần đăng nhập). Chỉ giữ trong bộ nhớ, không ghi ra ổ đĩa."""
    out = []
    if not isinstance(items, list):
        return out
    for c in items[:400]:
        if not isinstance(c, dict):
            continue
        name, value, domain = c.get('name'), c.get('value'), c.get('domain')
        path = c.get('path') or '/'
        if not all(isinstance(x, str) for x in (name, value, domain, path)):
            continue
        if not name or len(name) > 256 or len(value) > 8192 or COOKIE_BAD.search(name + value):
            continue
        if not COOKIE_DOMAIN.match(domain) or not path.startswith('/'):
            continue
        expires = c.get('expires')
        expires = int(expires) if isinstance(expires, (int, float)) and expires > 0 else None
        out.append(http.cookiejar.Cookie(
            0, name, value, None, False, domain, True, domain.startswith('.'), path, True,
            bool(c.get('secure')), expires, expires is None, None, None,
            {'HttpOnly': None} if c.get('httpOnly') else {},
        ))
    return out


def add_cookies(ydl, cookies):
    for cookie in cookies:
        ydl.cookiejar.set_cookie(cookie)


def valid_options(req):
    mode = req.get('mode')
    if mode == 'audio':
        fmt = req.get('audioFormat')
        if fmt not in AUDIO_FORMATS:
            raise BadRequest('Định dạng âm thanh không hợp lệ.')
        return {'mode': 'audio', 'audioFormat': fmt}
    if mode == 'video':
        quality = req.get('quality')
        valid_height = isinstance(quality, int) and not isinstance(quality, bool) and 100 <= quality <= 8640
        if quality != 'best' and not valid_height:
            raise BadRequest('Chất lượng không hợp lệ.')
        container = req.get('container')
        if container not in CONTAINERS:
            raise BadRequest('Định dạng video không hợp lệ.')
        return {'mode': 'video', 'quality': quality, 'container': container}
    raise BadRequest('Thiếu lựa chọn tải.')


# ---- yt-dlp ---------------------------------------------------------------------------
def import_ytdlp():
    try:
        import yt_dlp  # noqa: F401
        return yt_dlp
    except ImportError:
        raise BadRequest('Chưa cài yt-dlp. Chạy lại native-host\\install.bat.')


def base_options(cfg, logger, headers=None):
    opts = {
        'quiet': True,
        'noprogress': True,
        'logger': logger,
        'noplaylist': True,
        'windowsfilenames': True,
        'socket_timeout': 20,
        'retries': 5,
        'fragment_retries': 10,
        'concurrent_fragment_downloads': 4,
    }
    ffmpeg = ffmpeg_path(cfg)
    if ffmpeg:
        opts['ffmpeg_location'] = ffmpeg
    # YouTube cần một trình chạy JavaScript (mặc định yt-dlp tìm deno). Dùng node nếu đã cấu hình.
    runtimes = {}
    for name in ('deno', 'node', 'bun'):
        path = cfg.get(name)
        if path and os.path.exists(path):
            runtimes[name] = {'path': path}
    if runtimes:
        opts['js_runtimes'] = runtimes
    if headers:
        opts['http_headers'] = headers
    return opts


def friendly_error(text):
    text = re.sub(r'\x1b\[[0-9;]*m', '', str(text or '')).strip()
    text = re.sub(r'^(?:ERROR:\s*|Postprocessing:\s*|WARNING:\s*)+', '', text)
    low = text.lower()
    if 'unable to obtain file audio codec' in low:
        return 'Video này không có âm thanh, nên không tách ra tệp âm thanh được.'
    if 'unsupported url' in low:
        return ('Đây không phải địa chỉ của một video (vd. trang chủ, bảng tin, trang cá nhân). '
                'Hãy bấm phát video muốn tải hoặc mở bài viết / reel đó rồi thử lại.')
    if any(k in low for k in ('login required', 'log in', 'logged-in', 'logged in', 'login page',
                                'requires authentication', 'use --cookies', 'cookies-from-browser')):
        return ('Trang yêu cầu đăng nhập. Hãy đăng nhập trang này trong trình duyệt, bật "Dùng phiên đăng nhập '
                'của trình duyệt" trong thẻ Cài đặt, rồi thử lại.')
    if 'sign in to confirm' in low or 'not a bot' in low:
        return 'YouTube yêu cầu xác minh (chống bot). Thử lại sau ít phút.'
    if 'private video' in low:
        return 'Video riêng tư, không tải được.'
    if 'members-only' in low or 'join this channel' in low:
        return 'Video chỉ dành cho hội viên kênh.'
    if 'drm' in low:
        return 'Video có DRM (bảo vệ bản quyền), không tải được.'
    if 'ffmpeg' in low and ('not found' in low or 'not installed' in low):
        return 'Thiếu ffmpeg để ghép hình và tiếng. Chạy lại native-host\\install.bat.'
    if 'requested format is not available' in low:
        return 'Không có định dạng phù hợp. Thử chất lượng hoặc định dạng khác.'
    if 'http error 403' in low:
        return 'Máy chủ từ chối tải (HTTP 403). Thử lại hoặc cập nhật yt-dlp.'
    return text[:400] or 'Lỗi không rõ.'


def codec_family(vcodec):
    v = (vcodec or '').lower()
    if v.startswith(('av01', 'av1')):
        return 'av1'
    if v.startswith(('vp09', 'vp9')):
        return 'vp9'
    if v.startswith(('avc', 'h264')):
        return 'h264'
    if v.startswith(('hev', 'hvc', 'h265')):
        return 'h265'
    return 'other'


VIDEO_PREF = {
    'mp4': ['h264', 'h265', 'vp9', 'av1', 'other'],
    'webm': ['vp9', 'av1', 'h264', 'h265', 'other'],
    'mkv': ['av1', 'vp9', 'h265', 'h264', 'other'],
}
AUDIO_PREF = {'mp4': ('mp4a', 'aac'), 'webm': ('opus',), 'mkv': ('opus', 'mp4a')}


def estimate_sizes(info):
    """Ước lượng dung lượng theo từng độ phân giải & định dạng (gần đúng, chỉ để hiển thị)."""
    duration = info.get('duration') or 0
    formats = info.get('formats') or []

    def size(f):
        s = f.get('filesize') or f.get('filesize_approx')
        if not s and f.get('tbr') and duration:
            s = f['tbr'] * 1000 / 8 * duration
        return int(s) if s else 0

    video = [f for f in formats if f.get('vcodec') not in (None, 'none') and f.get('height')]
    audio = [f for f in formats if f.get('vcodec') == 'none' and f.get('acodec') not in (None, 'none')]

    def best_audio(container):
        prefs = AUDIO_PREF[container]
        pool = [f for f in audio if (f.get('acodec') or '').startswith(prefs)] or audio
        if not pool:
            return 0
        return size(max(pool, key=lambda f: f.get('abr') or f.get('tbr') or 0))

    heights = sorted({f['height'] for f in video}, reverse=True)
    sizes = {}
    for container, prefs in VIDEO_PREF.items():
        a = best_audio(container)
        table = {}
        for h in heights:
            pool = [f for f in video if f['height'] == h]
            pick = min(pool, key=lambda f: (prefs.index(codec_family(f.get('vcodec'))), -(f.get('fps') or 0), -(f.get('tbr') or 0)))
            s = size(pick)
            if s and pick.get('acodec') in (None, 'none'):
                s += a
            table[str(h)] = s
        sizes[container] = table
    audio_size = 0
    if audio:
        audio_size = size(max(audio, key=lambda f: f.get('abr') or f.get('tbr') or 0))
    return heights, sizes, audio_size


def summarize(info):
    kind = info.get('_type') or 'video'
    base = {
        'title': clean_title(info.get('title')),
        'id': info.get('id') or '',
        'extractor': info.get('extractor_key') or info.get('extractor') or '',
        'webpageUrl': info.get('webpage_url') or info.get('original_url') or '',
        'thumbnail': info.get('thumbnail') or '',
        'uploader': info.get('uploader') or info.get('channel') or '',
    }
    if kind in ('playlist', 'multi_video'):
        entries = []
        for i, e in enumerate(info.get('entries') or []):
            if not e:
                continue
            url = e.get('webpage_url') or e.get('url') or ''
            if not re.match(r'^https?://', url):
                continue
            entries.append({'index': i + 1, 'title': clean_title(e.get('title')) or url, 'url': url, 'duration': e.get('duration')})
            if len(entries) >= 50:
                break
        return {**base, 'kind': 'playlist', 'entries': entries}

    heights, sizes, audio_size = estimate_sizes(info)
    formats = info.get('formats') or []
    has_audio = any(f.get('acodec') not in ('none',) for f in formats) if formats else True
    return {
        **base,
        'kind': 'video',
        'duration': info.get('duration'),
        'isLive': bool(info.get('is_live')),
        'heights': heights,
        'sizes': sizes,
        'audioSize': audio_size,
        'hasAudio': has_audio,
    }


def cmd_info(req, cfg):
    yt_dlp = import_ytdlp()
    url = valid_url(req.get('url'))
    logger = YtdlpLogger()
    opts = base_options(cfg, logger, valid_headers(req.get('headers')))
    opts.update({'skip_download': True, 'extract_flat': 'in_playlist', 'playlistend': 50})
    cookies = valid_cookies(req.get('cookies'))
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            add_cookies(ydl, cookies)
            info = ydl.extract_info(url, download=False)
    except Exception as e:  # yt-dlp ném nhiều loại lỗi khác nhau
        return {'ok': False, 'error': friendly_error(logger.last_error or e)}
    if not info:
        return {'ok': False, 'error': 'Không tìm thấy video.'}
    return {'ok': True, 'info': summarize(info)}


def download_options(choice):
    if choice['mode'] == 'audio':
        fmt = choice['audioFormat']
        selector = {'m4a': 'ba[ext=m4a]/ba/b', 'opus': 'ba[acodec^=opus]/ba/b', 'mp3': 'ba/b'}[fmt]
        return {
            'format': selector,
            'postprocessors': [
                # preferredquality 0 = VBR tốt nhất; m4a/opus trùng nguồn thì chỉ tách, không nén lại
                {'key': 'FFmpegExtractAudio', 'preferredcodec': fmt, 'preferredquality': '0'},
                {'key': 'FFmpegMetadata', 'add_metadata': True},
            ],
        }
    quality = choice['quality']
    res = 'res' if quality == 'best' else f'res:{quality}'
    container = choice['container']
    sort = {
        'mp4': [res, 'vcodec:h264', 'acodec:aac'],   # dễ phát nhất; >1080p YouTube chỉ có VP9/AV1
        'webm': [res, 'vcodec:vp9', 'acodec:opus'],
        'mkv': [res],                                # codec tốt nhất có sẵn
    }[container]
    return {'format': 'bv*+ba/b', 'format_sort': sort, 'merge_output_format': container}


def remove_partials(paths):
    """Xoá tệp tải dở (x.part, x.part-Frag1, x.ytdl...) của lần tải bị huỷ."""
    for base in paths:
        for f in glob.glob(glob.escape(base) + '*'):
            if f == base or f[len(base):].startswith(('.part', '.ytdl')):
                try:
                    os.remove(f)
                except OSError:
                    pass


# Facebook ghép "9.9K views · 340 reactions | " vào đầu tiêu đề -> bỏ cho tên tệp gọn.
_COUNT = r'[\d.,]+\s*(?:[KMB]|N|Tr|nghìn|triệu)?'
TITLE_JUNK = rf'^\s*{_COUNT}\s+(?:views|lượt xem)(?:\s*·\s*{_COUNT}\s+(?:reactions|cảm xúc))?\s*\|\s*'


def clean_title(title):
    return re.sub(TITLE_JUNK, '', title or '', flags=re.I).strip()


def title_cleaner():
    from yt_dlp.postprocessor.metadataparser import MetadataParserPP
    return {
        'key': 'MetadataParser',
        'actions': [(MetadataParserPP.Actions.REPLACE, 'title', TITLE_JUNK, '')],
        'when': 'pre_process',
    }


def final_path(info):
    if not info:
        return None
    if info.get('_type') in ('playlist', 'multi_video'):
        for entry in info.get('entries') or []:
            path = final_path(entry)
            if path:
                return path
        return None
    for d in info.get('requested_downloads') or []:
        path = d.get('filepath') or d.get('filename')
        if path:
            return path
    return info.get('filepath')


def cmd_download(req, cfg, cancel):
    yt_dlp = import_ytdlp()
    from yt_dlp.utils import DownloadCancelled

    url = valid_url(req.get('url'))
    choice = valid_options(req)
    logger = YtdlpLogger()
    out_dir = downloads_dir(cfg)
    if not ffmpeg_path(cfg):
        log('Không thấy ffmpeg: video chất lượng cao có thể không ghép được')

    last = {'t': 0.0, 'key': None}
    partials = set()  # tệp đang tải dở, xoá đi nếu bị huỷ

    def on_progress(d):
        if cancel.is_set():
            raise DownloadCancelled()
        status = d.get('status')
        if status == 'downloading' and d.get('filename'):
            partials.add(d['filename'])
        info = d.get('info_dict') or {}
        part = 'audio' if info.get('vcodec') == 'none' else ('video' if info.get('acodec') == 'none' else 'av')
        now = time.monotonic()
        key = (status, info.get('format_id'))
        if status == 'downloading' and key == last['key'] and now - last['t'] < 0.3:
            return
        last['t'], last['key'] = now, key
        total = d.get('total_bytes') or d.get('total_bytes_estimate')
        done = d.get('downloaded_bytes')
        percent = None
        if total and done is not None:
            percent = min(100.0, done * 100.0 / total)
        elif d.get('fragment_count'):
            percent = min(100.0, (d.get('fragment_index') or 0) * 100.0 / d['fragment_count'])
        send({
            'type': 'progress', 'status': status, 'part': part, 'percent': percent,
            'downloaded': done, 'total': total, 'speed': d.get('speed'), 'eta': d.get('eta'),
            'height': info.get('height'),
        })

    def on_postprocess(d):
        if d.get('status') == 'started':
            send({'type': 'status', 'stage': d.get('postprocessor') or ''})

    opts = base_options(cfg, logger, valid_headers(req.get('headers')))
    opts.update(download_options(choice))
    opts['postprocessors'] = [title_cleaner()] + opts.get('postprocessors', [])
    opts.update({
        'paths': {'home': out_dir},
        'outtmpl': {'default': '%(title).150B [%(id)s].%(ext)s'},
        'progress_hooks': [on_progress],
        'postprocessor_hooks': [on_postprocess],
        'overwrites': False,
        'continuedl': True,
    })
    if choice['mode'] == 'video' and not ffmpeg_path(cfg):
        opts['format'] = 'b'  # không có ffmpeg: chỉ lấy bản đã có sẵn cả hình và tiếng

    log('download', url, json.dumps(choice))
    cookies = valid_cookies(req.get('cookies'))
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            add_cookies(ydl, cookies)
            info = ydl.extract_info(url, download=True)
    except DownloadCancelled:
        remove_partials(partials)
        return {'type': 'cancelled'}
    except Exception as e:
        remove_partials(partials)  # lỗi giữa chừng: không để lại tệp dở dang
        if cancel.is_set():
            return {'type': 'cancelled'}
        log('download failed', traceback.format_exc())
        return {'type': 'error', 'error': friendly_error(logger.last_error or e)}
    path = final_path(info)
    if path and not os.path.isabs(path):
        path = os.path.join(out_dir, path)
    entry = info
    if info and info.get('_type') in ('playlist', 'multi_video'):
        entry = next((e for e in info.get('entries') or [] if e), info)
    return {
        'type': 'done',
        'file': path,
        'title': (entry or {}).get('title') or '',
        'size': os.path.getsize(path) if path and os.path.exists(path) else None,
    }


def safe_existing_file(path, cfg):
    """Chỉ cho mở tệp nằm trong thư mục tải về."""
    if not isinstance(path, str) or not path:
        raise BadRequest('Thiếu đường dẫn tệp.')
    real = os.path.realpath(path)
    root = os.path.realpath(downloads_dir(cfg))
    try:
        inside = os.path.commonpath([real, root]) == root
    except ValueError:
        inside = False
    if not inside or not os.path.isfile(real):
        raise BadRequest('Không tìm thấy tệp (có thể đã bị xoá hoặc di chuyển).')
    return real


def cmd_reveal(req, cfg):
    path = safe_existing_file(req.get('path'), cfg)
    if sys.platform == 'win32':
        subprocess.Popen(f'explorer /select,"{path}"')
    else:
        subprocess.Popen(['xdg-open', os.path.dirname(path)])
    return {'ok': True}


def cmd_open(req, cfg):
    path = safe_existing_file(req.get('path'), cfg)
    if sys.platform == 'win32':
        os.startfile(path)  # noqa: S606 - đường dẫn đã kiểm tra nằm trong thư mục tải về
    else:
        subprocess.Popen(['xdg-open', path])
    return {'ok': True}


def cmd_ping(_req, cfg):
    try:
        import yt_dlp.version as v
        ytdlp = v.__version__
    except ImportError:
        ytdlp = None
    return {
        'ok': True,
        'host': VERSION,
        'ytdlp': ytdlp,
        'ffmpeg': bool(ffmpeg_path(cfg)),
        'jsRuntime': next((n for n in ('deno', 'node', 'bun') if cfg.get(n) and os.path.exists(cfg[n])), None),
        'downloadDir': downloads_dir(cfg),
    }


SIMPLE = {'ping': cmd_ping, 'info': cmd_info, 'reveal': cmd_reveal, 'open': cmd_open}


def main():
    cfg = load_config()
    first = read_message()
    if not first:
        return
    cmd = first.get('cmd')
    try:
        if cmd in SIMPLE:
            send(SIMPLE[cmd](first, cfg))
            return
        if cmd != 'download':
            send({'ok': False, 'error': f'Lệnh không hỗ trợ: {cmd}'})
            return

        # Tải: chạy ở luồng riêng, luồng chính tiếp tục nghe lệnh "cancel" / Chrome đóng kết nối.
        cancel = threading.Event()
        result = {}

        def worker():
            try:
                result['msg'] = cmd_download(first, cfg, cancel)
            except BadRequest as e:
                result['msg'] = {'type': 'error', 'error': str(e)}
            except Exception as e:
                log('worker crash', traceback.format_exc())
                result['msg'] = {'type': 'error', 'error': friendly_error(e)}
            send(result['msg'])
            os._exit(0)  # xong việc thì thoát, Chrome nhận onDisconnect sau tin nhắn cuối

        thread = threading.Thread(target=worker, daemon=True)
        thread.start()
        while True:
            msg = read_message()
            if msg is None:  # extension đóng kết nối -> dừng và dọn tệp dở
                cancel.set()
                thread.join(20)
                os._exit(0)
            if msg.get('cmd') == 'cancel':
                cancel.set()
    except BadRequest as e:
        send({'ok': False, 'type': 'error', 'error': str(e)})
    except Exception as e:
        log('crash', traceback.format_exc())
        send({'ok': False, 'type': 'error', 'error': friendly_error(e)})


if __name__ == '__main__':
    main()
