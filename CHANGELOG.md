# Changelog

All notable changes to EasyCalc. Newest first.

## 0.4.5

**New: selection totals.** Select two or more cells in any grid and a small panel appears at the bottom right showing **how many cells are selected and what they add up to**. Money columns total in the project's currency; quantities and other numbers total as plain figures. Works on read-only tables like Procurement too.

**Fixed**: selecting text *inside* a table cell showed no blue highlight — you could select and copy, but nothing appeared selected. Normal fields outside tables were unaffected. Introduced in 0.4.2 alongside the copy/paste work.

**Fixed**: the taskbar and window icon showed the Microsoft Edge logo instead of the EasyCalc icon.

## 0.4.4

**Fixed**: clicking into a cell on the Equipment Schedule (or any spreadsheet grid) left the field focused but with **no typing cursor**, so you couldn't type into it. Releasing the mouse button was clearing the text cursor the click had just placed. Affected every grid field; normal fields were unaffected. Cell selection, drag-select and copy are unchanged.

## 0.4.3

**Fixed**: selecting text in a normal field (Dashboard's Project Details or Branding sections, for example) would highlight fine while dragging, then lose the selection the instant you let go of the mouse button — making it impossible to copy or paste there. That's fixed; unrelated to the spreadsheet-grid copy work in 0.4.2, which is untouched.

## 0.4.2

**Rooms & Invoices**
- **Room Summary got a Level column.** Previously, if a room had no Room No. or Area entered, its Level value leaked into the "Rooms" column instead — that fallback is gone, and Level now shows properly in its own column (app, PDF, Excel).
- **Room invoices/BoMs**: the room's title and info now always render first on the page — notes and the floorplan image no longer appear above it.
- **Long printed tables no longer leave a blank page.** A table too long to fit on one page was being pushed onto a fresh page entirely (leaving the previous page blank underneath its heading) instead of simply flowing across pages at row boundaries — fixed for every export.

**Procurement**
- **Export PDF / Export Excel** buttons, matching the on-screen list plus per-supplier totals.

**Copy / paste**
- **Selecting cells and pressing Ctrl+C now actually reaches the clipboard** — copy silently did nothing before (the browser never saw a real selection to copy), on every grid, including a single unselected cell.
- Copy now writes **both plain text and a real HTML table**, so pasting into Excel, Word, or email lands as an actual formatted table, not raw tab-separated text.
- Copying now also works on **read-only tables** like Procurement, not just editable grids.
- **Right-click no longer clears your selection** before the menu opens, and **click-and-drag selects in one motion again** (a regression introduced while fixing the above).

## 0.4.1

**Labour & Materials**
- **Quantities now scale by room count**, exactly like the Equipment Schedule: a number entered against a system type is treated as *per room* and multiplied by how many rooms of that type exist. A `1` against a type used by 13 rooms now totals **13**. Types with **no rooms assigned no longer add to any total**. This also fixes a case where the Dashboard total and the Room Summary total could disagree.
- **Commissioning section:** the category **dropdowns are gone** — those cells are now normal editable cells like every other column.

**Room Matrix (PDF)**
- In **workbook exports** the matrix now prints at the **top of the first page**, under the title.
- **Column headers are rotated vertical**, so every system-type column is uniform and only as wide as the number it holds.
- The matrix **scales to fit the page** — no columns fall off the edge, whichever project you export.

**Documents**
- A document keeps the **same title with or without prices** (no more separate "Room Schedule" / "Bill of Materials" wording).

## 0.4.0

**Equipment Schedule**
- **Column filters:** a **Filters** dropdown shows/hides any column (except system types); hidden columns are skipped by keyboard navigation and copy.
- **Cell highlighting:** red / yellow / green / blue buttons colour the borders of the selected cells, rows or columns; a **Clear** button (selection) and a two-stage **Clear all**. Highlights save with the project and are separate from error cells.
- **Editable vs calculated:** Cost and Mark-up are editable; **Sell, Margin and Qty are now calculated (read-only)**. New **Mark-up + Contingency %** column. Description / Part # / Brand / Supplier are editable on every row.
- **Whole-number percentages** in all editable percent fields.
- **Per-section “+ Add row”** in each section header.
- **Show only affected rows** when there's a missing-type error (see below).

**Reordering** — drag a row's **⠿** handle to reorder within its section (Schedule, Labour & Materials, and Rooms), with a translucent ghost-row that follows the cursor and drops exactly where you release. **Click** the handle to select the whole row.

**Missing-type warnings** — a value entered against a system type that no room uses shows in **red and pulses**, with a matching pulsing warning at the top-right (only on the page that has the error) and a **Show affected rows** filter.

**Rooms & Types**
- **Duplicate a type** with the **D** button — copies its equipment/labour allocations and per-room quantities.
- Drag room rows to reorder; the drag handle sits in its own column.

**Quotes & Invoices**
- **Export Workbook** (and a **no-prices** variant) now lives on the **Room Summary** tab — one PDF with the room summary first, then every room invoice + its notes, and an optional **room matrix** page (checkbox).
- **Room Summary:** a **Remove room numbers** option (preview + exports).
- **Room Invoice:** bill-of-materials buttons — **BOM - no $ (per room)** and **BOM w/$**.
- **Quote expiry** is now configurable on the Dashboard.
- **Negative / discount line items** are retained in all quotes, invoices and exports.
- **Room-matrix exports** now use uniform cell sizes.

**Procurement**
- **Per-supplier totals** shown in their own table (kept out of the item selection); grand-total row styled like the header.
- **Fixed a crash** on catalogues containing numeric part numbers.

**Pricelist matching** now picks the **cheapest ex-GST price** across all price columns (trade / premium / special / etc.), reports which column it came from, and shows a cross-check reminder.

**Interface**
- **Sidebar** redesigned: uniform monochrome icons on the left of each button, grouped by purpose (Save now / Save As / Save as web file together, etc.); Autosave matches the button font.
- **Notes page** scrolls internally so its bottom stays in view.
- **Start page:** app-style dark/light toggle icon, a slightly darker light-mode background with matching animation, and a row-hover highlight on the recent-projects list.
- **Install as an app:** a web manifest lets you install EasyCalc from Edge/Chrome so it runs in its own window with its **own taskbar icon** (no browser chrome).

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
