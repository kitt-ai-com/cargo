# -*- coding: utf-8 -*-
"""
KakaoTalk PC app reader using clipboard-based message extraction.

Reads chat messages by focusing the KakaoTalk chat window,
selecting all text (Ctrl+A), copying (Ctrl+C), and parsing
the clipboard content.

Also monitors for KakaoTalk notification popups to auto-detect
new messages without requiring chat rooms to be pre-opened.
"""

import ctypes
import hashlib
import json
import os
import re
import subprocess
import tempfile
import time
from dataclasses import asdict, dataclass
from typing import Optional

try:
    from pywinauto import Application, Desktop
    from pywinauto.keyboard import send_keys
    from pywinauto import mouse
    HAS_PYWINAUTO = True
except ImportError:
    HAS_PYWINAUTO = False

user32 = ctypes.windll.user32


@dataclass
class Message:
    """A single chat message read from KakaoTalk."""

    room_name: str
    sender: str
    content: str
    content_type: str  # "text" or "image"
    sent_time: str = ""  # e.g. "오후 2:30"
    image_path: Optional[str] = None

    def to_json(self) -> str:
        return json.dumps(asdict(self), ensure_ascii=False)


class KatalkReader:
    """Reads messages from the KakaoTalk PC application via clipboard."""

    def __init__(self) -> None:
        self._app = None
        # room_name -> MD5 hash of last seen messages
        self._room_hashes: dict[str, str] = {}

    # ------------------------------------------------------------------
    # Connection
    # ------------------------------------------------------------------

    def connect(self) -> bool:
        """Check if KakaoTalk PC is running. Returns True on success."""
        if not HAS_PYWINAUTO:
            return False
        try:
            desktop = Desktop(backend="uia")
            windows = desktop.windows()
            for w in windows:
                title = w.window_text()
                if title == "\uce74\uce74\uc624\ud1a1":  # "카카오톡"
                    return True
            # Also check if any chat windows are open
            for w in windows:
                try:
                    # KakaoTalk chat windows have EVA_Window class
                    if w.element_info.class_name and "EVA_Window" in str(w.element_info.class_name):
                        return True
                except:
                    pass
            return False
        except Exception:
            return False

    # ------------------------------------------------------------------
    # Clipboard helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _get_clipboard_text() -> str:
        """Read clipboard content via PowerShell (reliable for Korean)."""
        try:
            result = subprocess.run(
                ["powershell", "-command", "Get-Clipboard"],
                capture_output=True,
                timeout=5,
            )
            return result.stdout.decode("cp949", errors="replace").strip()
        except Exception:
            return ""

    # ------------------------------------------------------------------
    # Clipboard image helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _grab_clipboard_image(save_dir: str = "") -> Optional[str]:
        """Read image from Windows clipboard and save as PNG. Returns path or None."""
        try:
            from PIL import ImageGrab
            img = ImageGrab.grabclipboard()
            if img is None:
                return None
            if not save_dir:
                save_dir = os.path.join(tempfile.gettempdir(), "katalk_images")
            os.makedirs(save_dir, exist_ok=True)
            filepath = os.path.join(save_dir, f"katalk_{int(time.time() * 1000)}.png")
            img.save(filepath, "PNG")
            return filepath
        except Exception:
            return None

    def _try_copy_chat_image(self, win, save_dir: str = "", msgs_after_image: int = 0) -> Optional[str]:
        """Click an image in chat to open viewer, Ctrl+C, save from clipboard.

        msgs_after_image: how many text messages appear after the target image.
        Used to estimate vertical click offset (each text msg ~30px).
        """
        import sys as _sys
        try:
            rect = win.rectangle()
            w = rect.right - rect.left
            h = rect.bottom - rect.top

            # Scroll to bottom
            send_keys("{END}")
            time.sleep(0.3)

            # Chat area: top ~10% is header, bottom ~20% is input box
            # Last message sits just above input box
            chat_bottom = rect.bottom - int(h * 0.22)
            # Offset upward for messages that come after the image (~35px per msg)
            offset_up = msgs_after_image * 35
            cx = rect.left + w // 2
            cy = chat_bottom - offset_up

            # Clamp to reasonable range (don't click above chat area)
            chat_top = rect.top + int(h * 0.10)
            cy = max(cy, chat_top)

            _sys.stderr.write(f"[reader] Clicking image at ({cx}, {cy}), msgs_after={msgs_after_image}\n")
            _sys.stderr.flush()

            # Click opens image viewer in KakaoTalk
            mouse.click(coords=(cx, cy))
            time.sleep(1.5)

            # Copy image in viewer
            send_keys("^c")
            time.sleep(0.5)

            img_path = self._grab_clipboard_image(save_dir)

            # Close viewer (Esc)
            send_keys("{ESC}")
            time.sleep(0.3)

            if img_path:
                _sys.stderr.write(f"[reader] Image saved: {img_path}\n")
            else:
                _sys.stderr.write(f"[reader] No image in clipboard\n")
            _sys.stderr.flush()

            return img_path
        except Exception as e:
            _sys.stderr.write(f"[reader] _try_copy_chat_image error: {e}\n")
            _sys.stderr.flush()
            return None

    # ------------------------------------------------------------------
    # Message hashing / deduplication
    # ------------------------------------------------------------------

    @staticmethod
    def _get_message_hash(messages: list[str]) -> str:
        """Return an MD5 hex-digest of the last 5 messages (or fewer)."""
        tail = messages[-5:] if len(messages) > 5 else messages
        combined = "\n".join(tail)
        return hashlib.md5(combined.encode("utf-8")).hexdigest()

    def _is_new_message(self, room_name: str, message_hash: str) -> bool:
        """Return True if message_hash differs from the last seen hash."""
        previous = self._room_hashes.get(room_name)
        if previous == message_hash:
            return False
        self._room_hashes[room_name] = message_hash
        return True

    # ------------------------------------------------------------------
    # Chat-line parsing
    # ------------------------------------------------------------------

    @staticmethod
    def _parse_chat_line(raw_text: str) -> Optional[dict]:
        r"""Parse a single KakaoTalk chat line.

        Format: [sender] [time] content
        Example: [화주김] [오후 2:30] 역삼동에서 해운대 박스3개 35만
        """
        pattern = r"^\[(.+?)\]\s*\[(.+?)\]\s*(.+)$"
        match = re.match(pattern, raw_text.strip())
        if not match:
            return None
        return {
            "sender": match.group(1),
            "time": match.group(2),
            "content": match.group(3),
        }

    # ------------------------------------------------------------------
    # Notification detection
    # ------------------------------------------------------------------

    def _enum_eva_windows(self) -> list[tuple[int, str, bool]]:
        """Enumerate all EVA_Window_Dblclk windows. Returns (hwnd, title, visible)."""
        results: list[tuple[int, str, bool]] = []

        def callback(hwnd, _):
            cls_buf = ctypes.create_unicode_buffer(256)
            user32.GetClassNameW(hwnd, cls_buf, 256)
            if cls_buf.value == "EVA_Window_Dblclk":
                length = user32.GetWindowTextLengthW(hwnd)
                buf = ctypes.create_unicode_buffer(length + 1)
                user32.GetWindowTextW(hwnd, buf, length + 1)
                visible = bool(user32.IsWindowVisible(hwnd))
                results.append((int(hwnd), buf.value, visible))
            return True

        cb_type = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_int, ctypes.c_int)
        user32.EnumWindows(cb_type(callback), 0)
        return results

    def snapshot_windows(self) -> set[int]:
        """Take a snapshot of current EVA window handles."""
        return {hwnd for hwnd, _, _ in self._enum_eva_windows()}

    def detect_notification(self, prev_handles: set[int]) -> Optional[int]:
        """Check if a new KakaoTalk notification popup appeared.

        Returns the hwnd of the notification popup, or None.
        Notification popups are new EVA_Window_Dblclk windows that are
        visible and have an empty title.
        """
        for hwnd, title, visible in self._enum_eva_windows():
            if hwnd not in prev_handles and visible and not title:
                return hwnd
        return None

    def click_notification(self, hwnd: int) -> Optional[str]:
        """Click a notification popup to open the chat room.

        Returns the room name (window title) of the newly opened chat window,
        or None if it failed.
        """
        import sys as _sys
        try:
            # Snapshot titled windows BEFORE clicking
            before = {
                h for h, title, vis in self._enum_eva_windows()
                if title and vis
            }

            # Get notification window rect and click center
            rect = ctypes.wintypes.RECT()
            user32.GetWindowRect(hwnd, ctypes.byref(rect))
            cx = (rect.left + rect.right) // 2
            cy = (rect.top + rect.bottom) // 2
            _sys.stderr.write(f"[reader] Clicking notification at ({cx}, {cy})\n")
            _sys.stderr.flush()
            mouse.click(coords=(cx, cy))
            time.sleep(1.5)

            # Find NEW chat window that appeared after clicking
            for h, title, visible in self._enum_eva_windows():
                if visible and title and title != "\uce74\uce74\uc624\ud1a1" and h not in before:
                    _sys.stderr.write(f"[reader] New chat window: {title}\n")
                    _sys.stderr.flush()
                    return title

            # Fallback: maybe window was reused — find the focused/foreground one
            fg_hwnd = user32.GetForegroundWindow()
            length = user32.GetWindowTextLengthW(fg_hwnd)
            buf = ctypes.create_unicode_buffer(length + 1)
            user32.GetWindowTextW(fg_hwnd, buf, length + 1)
            fg_title = buf.value
            if fg_title and fg_title != "\uce74\uce74\uc624\ud1a1":
                _sys.stderr.write(f"[reader] Foreground window: {fg_title}\n")
                _sys.stderr.flush()
                return fg_title
        except Exception as e:
            _sys.stderr.write(f"[reader] click_notification error: {e}\n")
            _sys.stderr.flush()
        return None

    def get_open_chat_rooms(self) -> list[str]:
        """Return titles of all currently open KakaoTalk chat room windows."""
        rooms = []
        for _, title, visible in self._enum_eva_windows():
            if visible and title and title != "\uce74\uce74\uc624\ud1a1":
                rooms.append(title)
        return rooms

    # ------------------------------------------------------------------
    # Room reading by window title (exact match)
    # ------------------------------------------------------------------

    def read_room_by_title(self, window_title: str, image_save_dir: str = "") -> list["Message"]:
        """Read messages from a chat room using its exact window title."""
        if not HAS_PYWINAUTO:
            return []

        messages: list[Message] = []
        try:
            import sys as _sys
            from pywinauto.findwindows import find_windows

            handles = find_windows(title=window_title, visible_only=False)
            if not handles:
                _sys.stderr.write(f"[reader] Window not found: {window_title}\n")
                _sys.stderr.flush()
                return []

            app = Application(backend="uia").connect(handle=handles[0])
            win = app.window(handle=handles[0])

            win.set_focus()
            time.sleep(0.5)

            rect = win.rectangle()
            h = rect.bottom - rect.top
            cx = rect.right - 20
            cy = rect.top + int(h * 0.4)
            mouse.click(coords=(cx, cy))
            time.sleep(0.3)

            send_keys("^a")
            time.sleep(0.3)
            send_keys("^c")
            time.sleep(0.3)

            mouse.click(coords=(cx, cy))

            text = self._get_clipboard_text()
            if not text:
                return []

            raw_lines = [l.strip() for l in text.split("\n") if l.strip()]

            current_hash = self._get_message_hash(raw_lines)
            if not self._is_new_message(window_title, current_hash):
                return []

            for line in raw_lines:
                parsed = self._parse_chat_line(line)
                if parsed:
                    content_type = "image" if parsed["content"] == "\uc0ac\uc9c4" else "text"
                    messages.append(
                        Message(
                            room_name=window_title,
                            sender=parsed["sender"],
                            content=parsed["content"],
                            content_type=content_type,
                            sent_time=parsed["time"],
                        )
                    )

            # Find the last image message and try to copy it from chat
            last_img_idx = None
            for i in range(len(messages) - 1, -1, -1):
                if messages[i].content_type == "image":
                    last_img_idx = i
                    break

            if last_img_idx is not None:
                msgs_after = len(messages) - 1 - last_img_idx
                _sys.stderr.write(f"[reader] Image found at index {last_img_idx}/{len(messages)-1} ({msgs_after} msgs after), attempting copy...\n")
                _sys.stderr.flush()
                img_path = self._try_copy_chat_image(win, image_save_dir, msgs_after_image=msgs_after)
                if img_path:
                    messages[last_img_idx].image_path = img_path

        except Exception as e:
            import sys as _sys
            _sys.stderr.write(f"[reader] Error in read_room_by_title: {type(e).__name__}: {e}\n")
            _sys.stderr.flush()

        return messages

    # ------------------------------------------------------------------
    # Room reading (clipboard-based, regex pattern match)
    # ------------------------------------------------------------------

    def read_room(self, room_name: str) -> list[Message]:
        """Read new messages from a KakaoTalk chat room via clipboard.

        The chat room window must already be open.
        """
        if not HAS_PYWINAUTO:
            return []

        messages: list[Message] = []
        try:
            import sys as _sys
            import re as _re
            # Extract ASCII words for safe title matching (avoids encoding issues)
            ascii_words = _re.findall(r'[A-Za-z0-9]+', room_name)
            pattern = ".*".join(ascii_words) if ascii_words else room_name
            _sys.stderr.write(f"[reader] pattern: {pattern}\n")
            _sys.stderr.flush()

            # Use Win32 API (EnumWindows) to find window handle, then wrap with UIA
            from pywinauto.findwindows import find_windows
            handles = find_windows(title_re=f".*{pattern}.*", visible_only=False)
            if not handles:
                _sys.stderr.write(f"[reader] Window not found for pattern: {pattern}\n")
                _sys.stderr.flush()
                return []

            app = Application(backend="uia").connect(handle=handles[0])
            win = app.window(handle=handles[0])
            _sys.stderr.write(f"[reader] found window (handle={handles[0]})\n")
            _sys.stderr.flush()

            # Focus and click chat area
            win.set_focus()
            time.sleep(0.5)

            rect = win.rectangle()
            w = rect.right - rect.left
            h = rect.bottom - rect.top
            # Click near right edge (scrollbar area) to avoid hitting links
            cx = rect.right - 20
            cy = rect.top + int(h * 0.4)
            mouse.click(coords=(cx, cy))
            time.sleep(0.3)

            # Select all + copy
            send_keys("^a")
            time.sleep(0.3)
            send_keys("^c")
            time.sleep(0.3)

            # Deselect by clicking safe area (right edge)
            mouse.click(coords=(cx, cy))

            # Read clipboard
            text = self._get_clipboard_text()
            if not text:
                return []

            raw_lines = [l.strip() for l in text.split("\n") if l.strip()]

            # Check for new content
            current_hash = self._get_message_hash(raw_lines)
            if not self._is_new_message(room_name, current_hash):
                return []

            # Parse only new lines (simple: return all parsed lines)
            for line in raw_lines:
                parsed = self._parse_chat_line(line)
                if parsed:
                    content_type = "image" if parsed["content"] == "\uc0ac\uc9c4" else "text"
                    messages.append(
                        Message(
                            room_name=room_name,
                            sender=parsed["sender"],
                            content=parsed["content"],
                            content_type=content_type,
                            sent_time=parsed["time"],
                        )
                    )
        except Exception as e:
            import sys as _sys
            _sys.stderr.write(f"[reader] Error in read_room: {type(e).__name__}: {e}\n")
            _sys.stderr.flush()

        return messages

    # ------------------------------------------------------------------
    # Image cache monitoring
    # ------------------------------------------------------------------

    @staticmethod
    def check_image_cache(cache_dir: str) -> list[str]:
        """Return paths to images in cache_dir modified within the last 60 seconds."""
        if not cache_dir or not os.path.isdir(cache_dir):
            return []

        image_extensions = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"}
        now = time.time()
        recent: list[str] = []

        for filename in os.listdir(cache_dir):
            ext = os.path.splitext(filename)[1].lower()
            if ext not in image_extensions:
                continue
            full_path = os.path.join(cache_dir, filename)
            try:
                mtime = os.path.getmtime(full_path)
                if now - mtime <= 60:
                    recent.append(full_path)
            except OSError:
                continue

        return recent
