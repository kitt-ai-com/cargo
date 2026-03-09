"""
KakaoTalk monitoring daemon.

Runs as a child process of the Electron app.  Monitors for KakaoTalk
notification popups and reads new messages from chat rooms.

Two modes:
  1. Notification mode (default): watches for KakaoTalk notification popups,
     clicks them to open the chat room, reads messages via clipboard.
  2. Room mode (legacy): polls pre-configured room names.

Output protocol (one JSON object per line):
    {"type": "message", "data": {...}}
    {"type": "image",   "data": {"path": "..."}}
    {"type": "status",  "data": {"message": "..."}}
    {"type": "error",   "data": {"message": "..."}}
"""

import json
import os
import sys
import time

# Force UTF-8 stdout on Windows (default is cp949 for Korean locale)
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

from katalk_reader import KatalkReader


# ------------------------------------------------------------------
# IPC helpers
# ------------------------------------------------------------------

def emit(msg_type: str, data: dict) -> None:
    """Write a single JSON line to stdout for the Electron process."""
    line = json.dumps({"type": msg_type, "data": data}, ensure_ascii=False)
    print(line, flush=True)


def emit_messages(messages: list) -> None:
    """Emit all parsed messages to the Electron process."""
    for msg in messages:
        emit("message", {
            "room_name": msg.room_name,
            "sender": msg.sender,
            "content": msg.content,
            "content_type": msg.content_type,
            "image_path": msg.image_path,
            "sent_time": msg.sent_time,
        })


# ------------------------------------------------------------------
# Configuration
# ------------------------------------------------------------------

def load_config() -> dict:
    config_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "monitor_config.json")
    defaults = {
        "rooms": [],
        "poll_interval": 3,
        "notification_poll_ms": 300,
        "image_cache_dir": "",
        "mode": "notification",
    }
    try:
        with open(config_path, "r", encoding="utf-8") as fh:
            config = json.load(fh)
        for key, value in defaults.items():
            config.setdefault(key, value)
        return config
    except (FileNotFoundError, json.JSONDecodeError) as exc:
        emit("error", {"message": f"Config load failed: {exc}"})
        return defaults


# ------------------------------------------------------------------
# Notification-based monitoring
# ------------------------------------------------------------------

def run_notification_mode(reader: KatalkReader, config: dict) -> None:
    """Monitor for KakaoTalk notification popups and read messages."""
    poll_ms = config["notification_poll_ms"]
    poll_sec = poll_ms / 1000.0
    image_cache_dir = config["image_cache_dir"]
    seen_images: set[str] = set()

    # Take initial snapshot of windows
    prev_handles = reader.snapshot_windows()
    emit("status", {"message": "Watching for KakaoTalk notifications..."})

    while True:
        # Check for notification popup
        new_hwnd = reader.detect_notification(prev_handles)
        if new_hwnd:
            emit("status", {"message": "Notification detected! Opening chat room..."})
            room_title = reader.click_notification(new_hwnd)
            if room_title:
                emit("status", {"message": f"Reading room: {room_title}"})
                messages = reader.read_room_by_title(room_title)
                emit_messages(messages)
            else:
                emit("error", {"message": "Could not open chat room from notification"})
            # Refresh snapshot after handling notification
            prev_handles = reader.snapshot_windows()
        # Don't update prev_handles in idle — prevents race condition
        # where a popup appears between detect and snapshot, getting
        # silently added to prev_handles without being processed.

        # Check for new images in cache directory
        if image_cache_dir:
            new_images = reader.check_image_cache(image_cache_dir)
            for img_path in new_images:
                if img_path not in seen_images:
                    seen_images.add(img_path)
                    emit("image", {"path": img_path})

        time.sleep(poll_sec)


# ------------------------------------------------------------------
# Legacy room-based monitoring
# ------------------------------------------------------------------

def run_room_mode(reader: KatalkReader, config: dict) -> None:
    """Poll pre-configured rooms (legacy mode)."""
    rooms = config["rooms"]
    poll_interval = config["poll_interval"]
    image_cache_dir = config["image_cache_dir"]
    seen_images: set[str] = set()

    emit("status", {"message": f"Polling {len(rooms)} room(s) every {poll_interval}s..."})

    while True:
        for room in rooms:
            messages = reader.read_room(room)
            emit_messages(messages)

        if image_cache_dir:
            new_images = reader.check_image_cache(image_cache_dir)
            for img_path in new_images:
                if img_path not in seen_images:
                    seen_images.add(img_path)
                    emit("image", {"path": img_path})

        time.sleep(poll_interval)


# ------------------------------------------------------------------
# Main
# ------------------------------------------------------------------

def main() -> None:
    config = load_config()
    reader = KatalkReader()

    emit("status", {"message": "Connecting to KakaoTalk..."})

    if not reader.connect():
        emit("error", {"message": "Failed to connect to KakaoTalk PC app. Is it running?"})
        sys.exit(1)

    mode = config.get("mode", "notification")
    emit("status", {"message": f"Connected. Mode: {mode}"})

    try:
        if mode == "notification":
            run_notification_mode(reader, config)
        else:
            run_room_mode(reader, config)
    except KeyboardInterrupt:
        emit("status", {"message": "Monitor stopped by user."})
    except Exception as exc:
        emit("error", {"message": f"Unexpected error: {exc}"})
        sys.exit(1)


if __name__ == "__main__":
    main()
