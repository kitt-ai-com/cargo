# -*- coding: utf-8 -*-
"""Quick test: read room with verbose errors."""
import sys
sys.stdout.reconfigure(encoding='utf-8')

import time
import subprocess
from pywinauto import Application
from pywinauto.keyboard import send_keys
from pywinauto import mouse

room_name = "kitt AI 10\uc5b5\ubc29"  # kitt AI 10억방
print(f"Looking for room: {room_name}")

try:
    app = Application(backend="uia").connect(title=room_name)
    win = app.window(title=room_name)
    print(f"Connected: {win.window_text()}")

    win.set_focus()
    time.sleep(0.3)

    rect = win.rectangle()
    w = rect.right - rect.left
    h = rect.bottom - rect.top
    cx = rect.left + w // 2
    cy = rect.top + int(h * 0.4)
    print(f"Clicking at ({cx}, {cy})")
    mouse.click(coords=(cx, cy))
    time.sleep(0.3)

    send_keys("^a")
    time.sleep(0.3)
    send_keys("^c")
    time.sleep(0.3)
    send_keys("{ESC}")

    result = subprocess.run(
        ["powershell", "-command", "Get-Clipboard"],
        capture_output=True
    )
    text = result.stdout.decode("cp949", errors="replace").strip()
    lines = text.split('\n') if text else []
    print(f"\nCaptured {len(lines)} lines. Last 5:")
    for line in lines[-5:]:
        print(f"  {line.rstrip()}")

except Exception as e:
    print(f"ERROR: {type(e).__name__}: {e}")
