# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding='utf-8')
from pywinauto import Desktop
desktop = Desktop(backend="uia")
for w in desktop.windows():
    t = w.window_text()
    if t.strip():
        print(t)
