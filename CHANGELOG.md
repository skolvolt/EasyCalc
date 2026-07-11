# Changelog

All notable changes to EasyCalc. Newest first.

## 0.3.2
- **Rooms page redesigned as a single clean matrix** — system types across the top (rename inline, drag **⠿** to reorder, **−** to remove, **+** to add), rooms down the side with a row-number gutter and a **COUNT** totals row. The old System Types panel and list view are gone; the matrix PDF/Excel export is retained.

## 0.3.1
- The **client-logo backdrop** in the sidebar now **auto-contrasts** with the logo — a mostly-dark logo gets a white backdrop, a mostly-light logo a dark one — for best visibility.

## 0.3.0
- **Rooms — multiple system types per room:** assign several types with their own quantities to a single room (list view).
- **Rooms — Matrix view:** a spreadsheet-style chart (rooms × system types) for quickly assigning quantities, with copy/paste and a per-type totals row.
- **Export the room matrix** to **PDF** (landscape) and **Excel** for on-site use — includes your letterhead and project/client details, with **no pricing or quote validity**.
- **File dialogs** (open / save / import) now always open **in front** of the app instead of hiding behind it.
- **UI zoom** no longer pushes the sidebar's bottom buttons off-screen — the sidebar stays one window tall and its nav scrolls if it runs out of room.

## 0.2.6
- **Import any list type on both pages:** the Equipment Schedule and Labour & Materials **Import list** buttons now accept **spreadsheets** (`.xlsx`/`.csv`), **JSON exports**, and previous **`.qmproj` projects**.

## 0.2.5
- **Import / Export lists:** Labour & Materials now has an **Import** button (load a list from an export **or a previous `.qmproj` project**) and an **Export** button. The Equipment Schedule gains an **Export** button too.

## 0.2.4
- **Labour & Materials:** added **Clear all** and **Set as default** buttons (matching the Equipment Schedule), so you can build your own default L&M list for new projects.
- Fixed the Installation category on the Labour & Materials page.
- **Fresh installs now start empty** — no pre-filled Equipment or Labour & Materials data. Build or import your own lists and use **Set as default** to reuse them.
- The current app **version is shown at the bottom of the start page**.
- Release notes now ship with the app (this file) and live in the repo.

## 0.2.3
- Fixed installer error *"code 193 / not a valid Win32 application"* after install — the launcher now starts correctly. This also fixes the in-place update relaunch.

## 0.2.2
- Updates now install and **reload in place** instead of getting stuck on "Updating".
- **Warns before closing** a window with unsaved project changes.

## 0.2.1
- Native **Open/Save file dialogs** — no more typing file paths; fixed the start-page "open" button.
- **Editable GST** field on the dashboard.
- **Delete/Backspace** clears all selected cells at once.

## 0.2.0
- Runs **headless in its own app window**; **in-app update** checks; macOS build support.

## 0.1.0
- Initial release.
