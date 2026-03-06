"""
KakaoTalk PC app reader using Windows UI Automation (pywinauto).

Reads chat messages from the KakaoTalk desktop application by inspecting
its UI elements. Outputs structured Message objects for downstream processing.
"""

import hashlib
import json
import os
import re
import time
from dataclasses import asdict, dataclass
from typing import Optional

# Graceful import: allow code to load even without pywinauto installed,
# so that data-only logic (Message, parsing, hashing) can be tested anywhere.
try:
    from pywinauto import Application
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
    """Reads messages from the KakaoTalk PC application via UI Automation."""

    def __init__(self) -> None:
        self._app = None
        self._main_window = None
        # room_name -> MD5 hash of last seen messages
        self._room_hashes: dict[str, str] = {}

    # ------------------------------------------------------------------
    # Connection
    # ------------------------------------------------------------------

    def connect(self) -> bool:
        """Connect to the running KakaoTalk PC process.

        Returns True on success, False otherwise.
        """
        if not HAS_PYWINAUTO:
            return False
        try:
            self._app = Application(backend="uia").connect(title_re=".*카카오톡.*")
            self._main_window = self._app.window(title_re=".*카카오톡.*")
            return True
        except Exception:
            return False

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
        """Return True if *message_hash* differs from the last seen hash for *room_name*."""
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
        """Parse a single chat line in KakaoTalk's display format.

        Expected format examples:
            [화주김] [오후 2:30] 역삼동에서 해운대 박스3개 35만
            [관리자] [오전 9:00] 안녕하세요

        Returns a dict with keys ``sender``, ``time``, ``content``
        or None if the line does not match the expected pattern.
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
    # Room reading
    # ------------------------------------------------------------------

    def read_room(self, room_name: str) -> list[Message]:
        """Read new messages from the chat room named *room_name*.

        Returns a (possibly empty) list of Message objects.
        Only messages that have not been seen before (based on hash
        comparison) are returned.
        """
        if not HAS_PYWINAUTO or self._app is None:
            return []

        messages: list[Message] = []
        try:
            # Navigate to the chat room
            chat_room = self._main_window.child_window(title=room_name, control_type="ListItem")
            chat_room.click_input()
            time.sleep(0.5)

            # Read the message list from the chat area
            msg_list = self._main_window.child_window(control_type="List", found_index=0)
            items = msg_list.children()
            raw_lines = [item.window_text() for item in items if item.window_text().strip()]

            # Check for new content via hash
            current_hash = self._get_message_hash(raw_lines)
            if not self._is_new_message(room_name, current_hash):
                return []

            # Parse each line into a Message
            for line in raw_lines:
                parsed = self._parse_chat_line(line)
                if parsed:
                    messages.append(
                        Message(
                            room_name=room_name,
                            sender=parsed["sender"],
                            content=parsed["content"],
                            content_type="text",
                        )
                    )
        except Exception:
            # UI element not found, window closed, etc.
            pass

        return messages

    # ------------------------------------------------------------------
    # Image cache monitoring
    # ------------------------------------------------------------------

    @staticmethod
    def check_image_cache(cache_dir: str) -> list[str]:
        """Return paths to images in *cache_dir* modified within the last 60 seconds."""
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
