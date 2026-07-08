EASYCALC - test build
=====================

What it is
----------
EasyCalc: a local project costing/quoting app - equipment schedule,
room types, labour & materials, live P&L, quotes/invoices, supplier
pricelist imports, and PDF export.
Runs entirely on this computer - nothing is sent anywhere.

How to run (Windows)
--------------------
1. Unzip this folder anywhere (e.g. Desktop).
2. Double-click EasyCalc.vbs
   - No console window - the app opens in its own window.
   - Runs headless in the background as "EasyCalc.exe".
3. To stop: open Task Manager (Ctrl+Shift+Esc), find "EasyCalc.exe",
   and click "End task". (Closing the app window leaves the background
   server running so other windows keep working.)

Optional: double-click "Create Desktop Shortcut.bat" once to get an
EasyCalc icon on your Desktop that launches the app.

Troubleshooting: if the app won't start, run start.bat instead - it shows
a console window with any startup errors.

Projects
--------
- Projects are saved as .qmproj files in Documents\Project Model.
- Everything autosaves as you work. "Save As..." (bottom of the sidebar)
  saves a copy anywhere you like and continues saving there.
- "Open project from file..." opens another project in a new window,
  so you can work on several at once.
- To share or back up a project, just copy its .qmproj file.

Features to try
---------------
- Ctrl + scroll (or Ctrl + / Ctrl -) zooms the whole interface;
  Ctrl 0 resets. Drag column edges in any table to resize them.
- Dark mode toggle: bottom of the sidebar.
- Company logo: Dashboard > Branding - shows on PDFs and in the sidebar.
- Supplier pricelists: Equipment Schedule > "Supplier pricelists" - point a
  supplier at an .xlsx/.csv pricelist file, Check prices, review, Update.
- PDF export: Quotes & Invoices > Download PDF (uses Microsoft Edge,
  present on all Windows 10/11 machines).

Notes
-----
- If port 8321 is busy, run from a console:  set PORT=8400 && start.bat

License
-------
EasyCalc (c) 2026 The Roach House. All rights reserved.
This is proprietary software: copying, modifying, redistributing, or
reverse engineering the build contents is not permitted.
See LICENSE.txt for the full terms.
