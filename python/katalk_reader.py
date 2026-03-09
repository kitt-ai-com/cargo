# -*- coding: utf-8 -*-
"""
KakaoTalk PC app reader using clipboard-based message extraction.

Reads chat messages by focusing the KakaoTalk chat window,
selecting all text (Ctrl+A), copying (Ctrl+C), and parsing
the clipboard content.
"""

import hashlib
import json
import os
import re
import subprocess
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


@dataclass
class Message:
    """A single chat message read from KakaoTalk."""

    room_name: str
    sender: str
    content: str
    content_type: str  # "text" or "image"
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
    # Room reading (clipboard-based)
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
