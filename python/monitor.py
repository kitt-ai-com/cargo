"""
KakaoTalk monitoring daemon.

Runs as a child process of the Electron app.  Polls KakaoTalk chat rooms
at a configurable interval and emits structured JSON lines to stdout,
which the Electron main process reads via IPC.

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

from katalk_reader import KatalkReader


# ------------------------------------------------------------------
# IPC helpers
# ------------------------------------------------------------------

def emit(msg_type: str, data: dict) -> None:
    """Write a single JSON line to stdout for the Electron process."""
    line = json.dumps({"type": msg_type, "data": data}, ensure_ascii=False)
    print(line, flush=True)


# ------------------------------------------------------------------
# Configuration
# ------------------------------------------------------------------

def load_config() -> dict:
    """Load monitor_config.json from the same directory as this script.

    Returns the parsed dict. Falls back to sensible defaults if the
    file is missing or malformed.
    """
    config_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "monitor_config.json")
    defaults = {
        "rooms": [],
        "poll_interval": 3,
        "image_cache_dir": "",
    }
    try:
        with open(config_path, "r", encoding="utf-8") as fh:
            config = json.load(fh)
        # Merge with defaults so missing keys are filled in
        for key, value in defaults.items():
            config.setdefault(key, value)
        return config
    except (FileNotFoundError, json.JSONDecodeError) as exc:
        emit("error", {"message": f"Config load failed: {exc}"})
        return defaults


# ------------------------------------------------------------------
# Main loop
# ------------------------------------------------------------------

def main() -> None:
    """Entry-point: connect to KakaoTalk and poll rooms in a loop."""
    config = load_config()
    rooms: list[str] = config["rooms"]
    poll_interval: int = config["poll_interval"]
    image_cache_dir: str = config["image_cache_dir"]

    reader = KatalkReader()

    emit("status", {"message": "Connecting to KakaoTalk..."})

    if not reader.connect():
        emit("error", {"message": "Failed to connect to KakaoTalk PC app. Is it running?"})
        sys.exit(1)

    emit("status", {"message": f"Connected. Monitoring {len(rooms)} room(s)."})

    seen_images: set[str] = set()

    try:
        while True:
            for room in rooms:
                messages = reader.read_room(room)
                for msg in messages:
                    emit("message", {
                        "room_name": msg.room_name,
                        "sender": msg.sender,
                        "content": msg.content,
                        "content_type": msg.content_type,
                        "image_path": msg.image_path,
                    })

            # Check for new images in cache directory
            if image_cache_dir:
                new_images = reader.check_image_cache(image_cache_dir)
                for img_path in new_images:
                    if img_path not in seen_images:
                        seen_images.add(img_path)
                        emit("image", {"path": img_path})

            time.sleep(poll_interval)

    except KeyboardInterrupt:
        emit("status", {"message": "Monitor stopped by user."})
    except Exception as exc:
        emit("error", {"message": f"Unexpected error: {exc}"})
        sys.exit(1)


if __name__ == "__main__":
    main()
