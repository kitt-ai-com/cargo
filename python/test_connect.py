# -*- coding: utf-8 -*-
"""Read KakaoTalk messages - click window center directly."""
import sys
sys.stdout.reconfigure(encoding='utf-8')

import time
import subprocess
from pywinauto import Application
from pywinauto.keyboard import send_keys
from pywinauto import mouse

app = Application(backend="uia").connect(title_re=".*kitt AI.*")
win = app.window(title_re=".*kitt AI.*")
print("Connected:", win.window_text())

win.set_focus()
time.sleep(0.3)

rect = win.rectangle()
w = rect.right - rect.left
h = rect.bottom - rect.top
print(f"Window: {w}x{h} at ({rect.left},{rect.top})")

# Click in chat message area (40% from top)
cx = rect.left + w // 2
cy = rect.top + int(h * 0.4)
print(f"Clicking at ({cx}, {cy})")
mouse.click(coords=(cx, cy))
time.sleep(0.5)

send_keys("^a")
time.sleep(0.3)
send_keys("^c")
time.sleep(0.5)

# Read clipboard via PowerShell with cp949 handling
result = subprocess.run(
    ["powershell", "-command", "Get-Clipboard"],
    capture_output=True
)
text = result.stdout.decode('cp949', errors='replace').strip()
if text:
    lines = text.split('\n')
    print(f"\nCaptured {len(lines)} lines (last 30):\n")
    for line in lines[-30:]:
        print(line.rstrip())
else:
    print("\nNo text captured from clipboard.")
