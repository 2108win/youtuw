#!/usr/bin/env python3
"""
Cài bộ tải video (yt-dlp) cho extension Cinema Tools trên Windows.

  python install.py                  cài thư viện, tìm ffmpeg/node, đăng ký với Chrome/Edge/Brave/Cốc Cốc
  python install.py --skip-deps      chỉ đăng ký lại (không cài/cập nhật yt-dlp, ffmpeg)
  python install.py --extension-id ID [--extension-id ID2]   chỉ định ID extension (nếu không tự dò được)
  python install.py --uninstall      gỡ đăng ký

ID extension xem ở chrome://extensions (bật Developer mode). Trình cài tự dò các trình duyệt
đang nạp thư mục extension này nên thường không cần nhập.
"""
import argparse
import glob
import json
import os
import shutil
import struct
import subprocess
import sys

HOST_NAME = 'com.cinematools.downloader'
HERE = os.path.dirname(os.path.abspath(__file__))
EXT_ROOT = os.path.dirname(HERE)
CONFIG_PATH = os.path.join(HERE, 'config.json')
BAT_PATH = os.path.join(HERE, 'host.bat')
MANIFEST_PATH = os.path.join(HERE, f'{HOST_NAME}.json')

# (tên hiển thị, khoá registry NativeMessagingHosts, thư mục User Data trong %LOCALAPPDATA%)
BROWSERS = [
    ('Chrome', r'Software\Google\Chrome\NativeMessagingHosts', r'Google\Chrome\User Data'),
    ('Edge', r'Software\Microsoft\Edge\NativeMessagingHosts', r'Microsoft\Edge\User Data'),
    ('Brave', r'Software\BraveSoftware\Brave-Browser\NativeMessagingHosts', r'BraveSoftware\Brave-Browser\User Data'),
    ('Cốc Cốc', r'Software\CocCoc\Browser\NativeMessagingHosts', r'CocCoc\Browser\User Data'),
    ('Chromium', r'Software\Chromium\NativeMessagingHosts', r'Chromium\User Data'),
]


def say(text=''):
    print(text, flush=True)


def run(cmd):
    say('  > ' + ' '.join(cmd))
    return subprocess.call(cmd)


# ---- Thư viện -------------------------------------------------------------------------
def install_ytdlp():
    say('\n[1/4] Cài / cập nhật yt-dlp (Python)...')
    code = run([sys.executable, '-m', 'pip', 'install', '-U', '--disable-pip-version-check', 'yt-dlp[default]'])
    if code != 0:
        say('  ! Không cài được yt-dlp bằng pip. Kiểm tra kết nối mạng rồi chạy lại.')
        return False
    return True


def find_ffmpeg():
    local = os.environ.get('LOCALAPPDATA', '')
    patterns = [
        os.path.join(local, r'Microsoft\WinGet\Packages\Gyan.FFmpeg*\*\bin\ffmpeg.exe'),
        os.path.join(local, r'Microsoft\WinGet\Packages\yt-dlp.FFmpeg*\*\bin\ffmpeg.exe'),
        os.path.join(local, r'Microsoft\WinGet\Packages\BtbN.FFmpeg*\*\bin\ffmpeg.exe'),
        r'C:\ffmpeg\bin\ffmpeg.exe',
        r'C:\Program Files\ffmpeg\bin\ffmpeg.exe',
        os.path.join(local, r'Microsoft\WinGet\Links\ffmpeg.exe'),
    ]
    for pattern in patterns:
        found = sorted(glob.glob(pattern), reverse=True)  # bản mới nhất trước
        if found:
            return found[0]
    return shutil.which('ffmpeg')


def install_ffmpeg(skip):
    say('\n[2/4] Tìm ffmpeg (ghép hình + tiếng, đổi định dạng âm thanh)...')
    path = find_ffmpeg()
    if path or skip:
        say(f'  ffmpeg: {path or "không có"}')
        return path
    if not shutil.which('winget'):
        say('  ! Không có winget. Tải ffmpeg tại https://www.gyan.dev/ffmpeg/builds/ rồi chạy lại.')
        return None
    run(['winget', 'install', '-e', '--id', 'Gyan.FFmpeg',
         '--accept-source-agreements', '--accept-package-agreements', '--disable-interactivity'])
    path = find_ffmpeg()
    say(f'  ffmpeg: {path or "không có"}')
    return path


def find_js_runtime():
    """YouTube cần một trình chạy JavaScript cho yt-dlp (deno hoặc node)."""
    found = {}
    deno = shutil.which('deno') or next(iter(glob.glob(os.path.expanduser(r'~\.deno\bin\deno.exe'))), None)
    if deno:
        found['deno'] = deno
    node = shutil.which('node')
    if not node and os.path.exists(r'C:\Program Files\nodejs\node.exe'):
        node = r'C:\Program Files\nodejs\node.exe'
    if node:
        found['node'] = node
    return found


# ---- ID extension -------------------------------------------------------------------
def detect_extension_ids():
    """Tìm ID của extension đang được nạp từ thư mục này trong các trình duyệt."""
    root = os.path.normcase(os.path.realpath(EXT_ROOT))
    local = os.environ.get('LOCALAPPDATA', '')
    found = []
    for name, _key, user_data in BROWSERS:
        base = os.path.join(local, user_data)
        if not os.path.isdir(base):
            continue
        for pref in glob.glob(os.path.join(base, '*', 'Preferences')) + glob.glob(os.path.join(base, '*', 'Secure Preferences')):
            try:
                with open(pref, encoding='utf-8') as f:
                    data = json.load(f)
            except (OSError, ValueError):
                continue
            settings = (data.get('extensions') or {}).get('settings') or {}
            for ext_id, s in settings.items():
                path = s.get('path') if isinstance(s, dict) else None
                if path and os.path.normcase(os.path.realpath(path)) == root:
                    profile = os.path.basename(os.path.dirname(pref))
                    found.append((ext_id, f'{name} / {profile}'))
    return found


# ---- Đăng ký ---------------------------------------------------------------------------
def write_files(ids, ffmpeg, runtimes):
    say('\n[3/4] Ghi cấu hình bộ nối...')
    config = {'python': sys.executable, 'ffmpeg': ffmpeg, **runtimes}
    with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
        json.dump(config, f, ensure_ascii=False, indent=2)
    # Chrome gọi host.bat (Windows không chạy trực tiếp .py). Dùng đường dẫn Python tuyệt đối
    # vì Chrome không thấy PATH mới cập nhật.
    with open(BAT_PATH, 'w', encoding='utf-8', newline='\r\n') as f:
        f.write('@echo off\n')
        f.write(f'"{sys.executable}" -u "%~dp0host.py" %*\n')
    manifest = {
        'name': HOST_NAME,
        'description': 'Cinema Tools - bộ tải video (yt-dlp)',
        'path': BAT_PATH,
        'type': 'stdio',
        'allowed_origins': [f'chrome-extension://{i}/' for i in ids],
    }
    with open(MANIFEST_PATH, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    say(f'  {CONFIG_PATH}\n  {BAT_PATH}\n  {MANIFEST_PATH}')


def register():
    import winreg
    say('\n[4/4] Đăng ký với trình duyệt...')
    for name, key, _ in BROWSERS:
        try:
            with winreg.CreateKey(winreg.HKEY_CURRENT_USER, f'{key}\\{HOST_NAME}') as k:
                winreg.SetValueEx(k, '', 0, winreg.REG_SZ, MANIFEST_PATH)
            say(f'  {name}: đã đăng ký')
        except OSError as e:
            say(f'  {name}: lỗi {e}')


def unregister():
    import winreg
    for name, key, _ in BROWSERS:
        try:
            winreg.DeleteKey(winreg.HKEY_CURRENT_USER, f'{key}\\{HOST_NAME}')
            say(f'  {name}: đã gỡ')
        except FileNotFoundError:
            pass
        except OSError as e:
            say(f'  {name}: lỗi {e}')
    for path in (BAT_PATH, MANIFEST_PATH, CONFIG_PATH):
        if os.path.exists(path):
            os.remove(path)


def self_test():
    """Gửi lệnh ping tới host.bat giống như Chrome."""
    data = json.dumps({'cmd': 'ping'}).encode()
    try:
        proc = subprocess.run(['cmd.exe', '/d', '/c', BAT_PATH], input=struct.pack('<I', len(data)) + data,
                              capture_output=True, timeout=60)
        out = proc.stdout
        size = struct.unpack('<I', out[:4])[0]
        return json.loads(out[4:4 + size].decode('utf-8'))
    except Exception as e:  # noqa: BLE001
        return {'ok': False, 'error': str(e)}


def main():
    if sys.platform != 'win32':
        say('Trình cài này dành cho Windows.')
        return 1
    parser = argparse.ArgumentParser(description='Cài bộ tải video cho Cinema Tools')
    parser.add_argument('--extension-id', action='append', default=[], help='ID extension (xem ở chrome://extensions)')
    parser.add_argument('--skip-deps', action='store_true', help='không cài / cập nhật yt-dlp và ffmpeg')
    parser.add_argument('--uninstall', action='store_true', help='gỡ đăng ký bộ nối')
    args = parser.parse_args()

    if args.uninstall:
        unregister()
        say('Đã gỡ bộ nối. (yt-dlp và ffmpeg vẫn còn trên máy.)')
        return 0

    say('=== Cài bộ tải video cho Cinema Tools ===')
    say(f'Python: {sys.executable}')
    if sys.version_info < (3, 9):
        say('Cần Python 3.9 trở lên.')
        return 1

    ids = []
    for ext_id in args.extension_id:
        ext_id = ext_id.strip().lower()
        if len(ext_id) == 32 and all('a' <= c <= 'p' for c in ext_id):
            ids.append(ext_id)
        else:
            say(f'ID không hợp lệ: {ext_id}')
            return 1
    detected = detect_extension_ids()
    for ext_id, where in detected:
        say(f'Tìm thấy extension: {ext_id} ({where})')
        if ext_id not in ids:
            ids.append(ext_id)
    if not ids:
        say('\nChưa thấy extension trong trình duyệt nào.')
        say('Hãy nạp extension (chrome://extensions > Load unpacked) rồi chạy lại,')
        say('hoặc chạy: install.bat --extension-id <ID của extension>')
        return 1

    if not args.skip_deps:
        install_ytdlp()
    ffmpeg = install_ffmpeg(args.skip_deps)
    runtimes = find_js_runtime()
    say(f'  Trình chạy JavaScript cho YouTube: {", ".join(f"{k} ({v})" for k, v in runtimes.items()) or "không có"}')
    if not runtimes:
        say('  ! Nên cài Node.js (https://nodejs.org) hoặc Deno, nếu không YouTube có thể chỉ cho tải chất lượng thấp.')

    write_files(ids, ffmpeg, runtimes)
    register()

    res = self_test()
    say('')
    if res.get('ok'):
        say(f'Hoàn tất! yt-dlp {res.get("ytdlp")} · ffmpeg: {"có" if res.get("ffmpeg") else "KHÔNG"} · lưu vào: {res.get("downloadDir")}')
        say('Mở lại popup extension (thẻ "Tải về") để dùng. Không cần khởi động lại trình duyệt.')
        return 0
    say(f'Đã đăng ký nhưng thử chạy bộ nối bị lỗi: {res.get("error")}')
    return 1


if __name__ == '__main__':
    sys.exit(main())
