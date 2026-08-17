import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import Icon from './Icon';

/** execCommand is deprecated but is still the simplest cross-browser rich-text
 *  editing for a local app, and every Chromium/WebKit build supports it. */
const exec = (cmd: string, value?: string) => document.execCommand(cmd, false, value);

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * The app's UI zoom (Ctrl+scroll) is a CSS `zoom` on <body>.
 *
 * getBoundingClientRect() and pointer coordinates come back in *zoomed* pixels,
 * while layout values like clientWidth and anything we write to `style` are in
 * unzoomed CSS pixels. Mixing the two applies the zoom twice — the resize frame
 * drifts off the image by exactly this factor. Divide measured values by it to
 * get back into CSS pixels.
 */
const uiZoom = () => Number(getComputedStyle(document.body).zoom) || 1;

/** Fonts that ship with Windows/macOS, so a PDF renders what you picked. */
const FONTS = [
  'Segoe UI', 'Arial', 'Calibri', 'Cambria', 'Georgia',
  'Times New Roman', 'Trebuchet MS', 'Verdana', 'Courier New', 'Consolas',
];
const SIZES_PX = [9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 40];

// Traditional two-row palette: greys along the top, colours beneath.
const TEXT_COLOURS = [
  '#000000', '#444444', '#666666', '#999999', '#cccccc', '#eeeeee', '#ffffff', '#8d6e63',
  '#c62828', '#e65100', '#f9a825', '#2e7d32', '#00838f', '#1256a0', '#4527a0', '#6a1b9a',
];
const HILITE_COLOURS = [
  '#ffe066', '#fff59d', '#dcedc8', '#b9f6ca', '#b2ebf2', '#b3e5fc', '#d1c4e9', '#f8bbd0',
  '#ffab91', '#ffcc80', '#e6ee9c', '#c8e6c9', '#bbdefb', '#e1bee7', '#e0e0e0', 'transparent',
];

const normaliseHex = (v: string): string | null => {
  const t = v.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(t)) return '#' + t.split('').map((c) => c + c).join('');
  return /^[0-9a-f]{6}$/i.test(t) ? '#' + t.toLowerCase() : null;
};

/**
 * A colour button with a swatch palette.
 *
 * A native <input type="color"> was the obvious choice and the wrong one: the
 * picker takes focus, which collapses the selection you were about to colour.
 * Swatches can preventDefault on mousedown, so focus never leaves the editor
 * and the highlighted text stays highlighted while you choose.
 */
function ColourTool({
  label, title, colours, onPick, onOpen, onClose,
}: {
  label: ReactNode; title: string; colours: string[];
  onPick: (c: string) => void;
  /** Fired as the palette opens, while the text selection is still intact. */
  onOpen: () => void;
  /** Fired when it closes without necessarily picking anything. */
  onClose: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false);
  const [hex, setHex] = useState('');

  useEffect(() => {
    if (!open) return;
    const close = () => { setOpen(false); setCustom(false); onClose(); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const pick = (c: string) => { onPick(c); setOpen(false); setCustom(false); };
  const applyHex = () => { const c = normaliseHex(hex); if (c) pick(c); };

  return (
    <span className="notes-colourwrap">
      <button
        type="button"
        className="notes-tool"
        title={title}
        onMouseDown={(e) => {
          e.preventDefault();   // keeps the selection alive in the editor
          e.stopPropagation();
          setOpen((o) => { if (o) onClose(); else onOpen(); return !o; });
          setCustom(false);
        }}
      >
        {label}
      </button>

      {open && (
        <span className="notes-swatches" onMouseDown={(e) => e.stopPropagation()}>
          <span className="notes-swatch-grid">
            {colours.map((c) => (
              <button
                key={c}
                type="button"
                className={'notes-swatch' + (c === 'transparent' ? ' none' : '')}
                title={c === 'transparent' ? 'None' : c}
                style={c === 'transparent' ? undefined : { background: c }}
                onMouseDown={(e) => { e.preventDefault(); pick(c); }}
              />
            ))}
          </span>

          {!custom ? (
            <button
              type="button"
              className="notes-custom-btn"
              onMouseDown={(e) => { e.preventDefault(); setCustom(true); }}
            >
              Custom…
            </button>
          ) : (
            // The gradient picker and the hex box both take focus, which drops
            // the selection — onOpen stashed it, and applyColour puts it back.
            <span className="notes-custom">
              <input
                type="color"
                title="Pick any colour"
                onChange={(e) => pick(e.target.value)}
              />
              <input
                type="text"
                className="notes-hex"
                placeholder="#RRGGBB"
                value={hex}
                onChange={(e) => setHex(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyHex(); } }}
              />
              <button
                type="button"
                className="notes-custom-btn"
                disabled={!normaliseHex(hex)}
                onMouseDown={(e) => { e.preventDefault(); applyHex(); }}
              >
                Apply
              </button>
            </span>
          )}
        </span>
      )}
    </span>
  );
}

/** Every grab point, with which way each axis pushes (0 = axis not driven). */
const HANDLES = [
  { k: 'nw', x: -1, y: -1 }, { k: 'n', x: 0, y: -1 }, { k: 'ne', x: 1, y: -1 },
  { k: 'w', x: -1, y: 0 }, /*                      */ { k: 'e', x: 1, y: 0 },
  { k: 'sw', x: -1, y: 1 }, { k: 's', x: 0, y: 1 }, { k: 'se', x: 1, y: 1 },
] as const;
type Handle = (typeof HANDLES)[number];

type Box = { left: number; top: number; width: number; height: number };

/** Text position under the pointer. Chromium ships caretRangeFromPoint, the
 *  standard is caretPositionFromPoint — take whichever exists. */
const caretFromPoint = (x: number, y: number): { node: Node; offset: number } | null => {
  const d = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const p = d.caretPositionFromPoint?.(x, y);
  if (p) return { node: p.offsetNode, offset: p.offset };
  const r = d.caretRangeFromPoint?.(x, y);
  return r ? { node: r.startContainer, offset: r.startOffset } : null;
};

interface Props {
  value: string;
  onChange: (html: string) => void;
  minHeight?: number;
  placeholder?: string;
  /** Fill the remaining viewport height and scroll internally (Notes page). */
  fill?: boolean;
}

/** A small WordPad-style rich-text editor backed by a contentEditable div. */
export default function RichText({ value, onChange, minHeight = 260, placeholder, fill = false }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  // The image currently picked for resizing, and where to draw its handles.
  // Chromium dropped the native contentEditable image handles years ago, so a
  // pasted image otherwise has no way to be sized or placed at all.
  const [sel, setSel] = useState<HTMLImageElement | null>(null);
  const [box, setBox] = useState<Box | null>(null);

  // Sync external changes (undo, project switch) in — but never while the user
  // is typing, so the caret doesn't jump.
  // Held while a colour palette is open. Its hex box takes focus, and a value
  // round-trip would otherwise rewrite the editor's markup underneath — which
  // detaches the selection we stashed and leaves the colour landing on nothing.
  const holdSync = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (el && !holdSync.current && document.activeElement !== el && el.innerHTML !== (value ?? '')) {
      el.innerHTML = value ?? '';
      setSel(null); // the old node went with the replaced markup
    }
  }, [value]);

  const save = () => { if (ref.current) onChange(ref.current.innerHTML); };
  const run = (cmd: string, val?: string) => { ref.current?.focus(); exec(cmd, val); save(); };

  // Opening the native colour picker moves focus out of the editor, which drops
  // the selection — so stash it on the way out and put it back before applying.
  const savedRange = useRef<Range | null>(null);
  const rememberSelection = () => {
    holdSync.current = true;
    const s = window.getSelection();
    if (s?.rangeCount && ref.current?.contains(s.anchorNode)) {
      savedRange.current = s.getRangeAt(0).cloneRange();
    }
  };
  /** Let external value syncs through again once the interaction is over. */
  const releaseSync = () => { holdSync.current = false; };
  const restoreSelection = () => {
    const r = savedRange.current;
    if (!r || !ref.current) return;
    ref.current.focus();
    const s = window.getSelection();
    s?.removeAllRanges();
    s?.addRange(r);
  };

  /** Run a command against the text that was selected before a dropdown or
   *  picker took focus. Opening a <select> collapses the selection, so without
   *  putting it back the command lands on nothing. */
  const runOnSelection = (cmd: string, val?: string) => {
    const s = window.getSelection();
    const live = !!s?.rangeCount && !!ref.current?.contains(s.anchorNode);
    if (live) ref.current?.focus(); else restoreSelection();
    exec(cmd, val);
    save();
    releaseSync();
  };

  /** Colour the text or its highlight. styleWithCSS makes Chromium emit a
   *  <span style> instead of a deprecated <font> tag, which the PDF honours. */
  const applyColour = (cmd: 'foreColor' | 'hiliteColor', colour: string) => {
    // The swatches keep focus in the editor, so the live selection is usually
    // still there; only fall back to the stashed one if something took focus.
    const s = window.getSelection();
    const live = !!s?.rangeCount && !!ref.current?.contains(s.anchorNode);
    if (!live) restoreSelection();
    exec('styleWithCSS', 'true');
    // hiliteColor is what Chromium and Firefox both take for an inline
    // highlight; older engines only know backColor, so fall back if it is
    // refused rather than silently doing nothing.
    if (cmd === 'hiliteColor') {
      if (!exec('hiliteColor', colour)) exec('backColor', colour);
    } else {
      exec(cmd, colour);
    }
    save();
    releaseSync();
  };

  /** Font size in real pixels.
   *
   *  execCommand only understands the seven legacy HTML sizes, so there is no
   *  way to ask it for 17px. The usual way round it: tag the selection with the
   *  rare size 7, then swap those <font> tags for spans carrying the px value. */
  const applyFontSizePx = (px: number) => {
    const el = ref.current;
    if (!el) return;
    restoreSelection();
    exec('styleWithCSS', 'false');
    exec('fontSize', '7');
    el.querySelectorAll('font[size="7"]').forEach((f) => {
      const span = document.createElement('span');
      span.style.fontSize = `${px}px`;
      while (f.firstChild) span.appendChild(f.firstChild);
      f.replaceWith(span);
    });
    save();
    releaseSync();
  };

  /** Position the handle frame over the selected image, in host coordinates. */
  const measure = useCallback(() => {
    const el = ref.current, host = hostRef.current;
    if (!sel || !el || !host || !el.contains(sel)) { setBox(null); return; }
    const i = sel.getBoundingClientRect(), h = host.getBoundingClientRect();
    const z = uiZoom();
    setBox({
      left: (i.left - h.left) / z, top: (i.top - h.top) / z,
      width: i.width / z, height: i.height / z,
    });
  }, [sel]);

  useLayoutEffect(measure, [measure, value]);

  // Keep the frame glued to the image while the editor scrolls or the window
  // changes shape, and drop it when a click lands outside this editor.
  useEffect(() => {
    if (!sel) return;
    const el = ref.current;
    const onDocDown = (e: MouseEvent) => {
      if (hostRef.current && !hostRef.current.contains(e.target as Node)) setSel(null);
    };
    el?.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    document.addEventListener('mousedown', onDocDown);
    return () => {
      el?.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
      document.removeEventListener('mousedown', onDocDown);
    };
  }, [sel, measure]);

  /** Apply inline styles to the picked image and persist. Inline is deliberate:
   *  the notes HTML is dropped straight into the PDF, so styling travels with
   *  it and the export matches the screen. */
  const styleImage = (styles: Record<string, string>) => {
    if (!sel) return;
    for (const [k, v] of Object.entries(styles)) sel.style.setProperty(k, v);
    measure();
    save();
  };

  const startResize = (e: React.MouseEvent, h: Handle) => {
    if (!sel) return;
    e.preventDefault();  // don't blur the editor or start a text selection
    e.stopPropagation();
    const r = sel.getBoundingClientRect();
    const z = uiZoom();
    const startX = e.clientX, startY = e.clientY;
    // work entirely in CSS pixels — clientWidth and style.width are in those,
    // so a zoomed rect or pointer delta has to be divided back first
    const startW = r.width / z, startH = r.height / z;
    const ratio = startH / startW || 1;
    const maxW = ref.current ? ref.current.clientWidth - 40 : 1600;

    const onMove = (ev: MouseEvent) => {
      const dx = ((ev.clientX - startX) / z) * h.x;
      const dy = ((ev.clientY - startY) / z) * h.y;
      // Aspect is always locked. A corner is driven by whichever axis the
      // pointer moved further along, so the image tracks the diagonal instead
      // of ignoring half the gesture; an edge is driven by its own axis alone.
      let w: number;
      if (h.x && h.y) w = Math.abs(dx) >= Math.abs(dy) ? startW + dx : (startH + dy) / ratio;
      else if (h.x) w = startW + dx;
      else w = (startH + dy) / ratio;

      // Legacy width/height attributes would override the style, so drop them.
      sel.removeAttribute('width');
      sel.removeAttribute('height');
      sel.style.width = `${Math.round(clamp(w, 40, Math.max(80, maxW)))}px`;
      sel.style.height = 'auto';
      measure();
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      save();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  /**
   * Drag an image to somewhere else in the text, with the wrap following live.
   *
   * Text can only wrap around a *float*, so there is no way to drop an image at
   * an arbitrary x/y and still have text flow around it — absolute positioning
   * would put the image on top of the words instead. What this does is move the
   * image to the text position under the pointer and hug whichever side it was
   * dropped nearest, which reflows the paragraph as you drag.
   */
  const startMove = (e: React.MouseEvent, img: HTMLImageElement) => {
    const ed = ref.current;
    if (!ed) return;
    const startX = e.clientX, startY = e.clientY;
    let moved = false;
    let lastKey = '';

    const onMove = (ev: MouseEvent) => {
      // a few pixels of slack, so a plain click still just selects
      if (!moved && Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) < 5) return;
      if (!moved) { moved = true; document.body.style.cursor = 'grabbing'; }
      ev.preventDefault();

      const pos = caretFromPoint(ev.clientX, ev.clientY);
      if (pos && ed.contains(pos.node) && pos.node !== img && !img.contains(pos.node)) {
        // Re-inserting on every pixel would shred the text into fragments, so
        // only act when the drop point actually changes.
        const key = `${(pos.node as Text).data?.length ?? ''}:${pos.offset}`;
        if (key !== lastKey) {
          lastKey = key;
          const r = document.createRange();
          r.setStart(pos.node, pos.offset);
          r.collapse(true);
          r.insertNode(img); // the node already exists, so this moves it
        }
      }

      const b = ed.getBoundingClientRect();
      const left = ev.clientX < b.left + b.width / 2;
      img.style.float = left ? 'left' : 'right';
      img.style.display = 'inline';
      img.style.margin = left ? '0.4em 1ch 0.4em 0' : '0.4em 0 0.4em 1ch';
      measure();
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      if (moved) {
        ed.normalize(); // stitch the split text nodes back together
        save();
      }
      measure();
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const Tool = ({ cmd, value: v, label, title }: { cmd: string; value?: string; label: ReactNode; title: string }) => (
    <button
      type="button"
      className="notes-tool"
      title={title}
      onMouseDown={(e) => { e.preventDefault(); run(cmd, v); }}
    >
      {label}
    </button>
  );

  /** A button that restyles the picked image (wrap / align / reset). */
  const ImgTool = ({ styles, label, title }: { styles: Record<string, string>; label: ReactNode; title: string }) => (
    <button
      type="button"
      className="notes-tool"
      title={title}
      onMouseDown={(e) => { e.preventDefault(); styleImage(styles); }}
    >
      {label}
    </button>
  );

  return (
    <div className={'richtext' + (fill ? ' richtext-fill' : '')} ref={hostRef}>
      <div className="notes-toolbar">
        <Tool cmd="bold" label={<b>B</b>} title="Bold (Ctrl+B)" />
        <Tool cmd="italic" label={<i>I</i>} title="Italic (Ctrl+I)" />
        <Tool cmd="underline" label={<u>U</u>} title="Underline (Ctrl+U)" />
        <Tool cmd="strikeThrough" label={<s>S</s>} title="Strikethrough" />
        <span className="notes-sep" />
        <select
          className="notes-tool"
          title="Paragraph style"
          defaultValue=""
          onMouseDown={rememberSelection}
          onChange={(e) => { const v = e.target.value; e.currentTarget.value = ''; runOnSelection('formatBlock', v); }}
        >
          <option value="" disabled>Style…</option>
          <option value="H1">Heading 1</option>
          <option value="H2">Heading 2</option>
          <option value="H3">Heading 3</option>
          <option value="P">Normal</option>
        </select>
        <select
          className="notes-tool"
          title="Font"
          defaultValue=""
          onMouseDown={rememberSelection}
          onChange={(e) => { const v = e.target.value; e.currentTarget.value = ''; runOnSelection('fontName', v); }}
        >
          <option value="" disabled>Font…</option>
          {FONTS.map((f) => (
            <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
          ))}
        </select>
        <select
          className="notes-tool"
          title="Font size in pixels"
          defaultValue=""
          onMouseDown={rememberSelection}
          onChange={(e) => { const v = Number(e.target.value); e.currentTarget.value = ''; applyFontSizePx(v); }}
        >
          <option value="" disabled>Size…</option>
          {SIZES_PX.map((s) => (
            <option key={s} value={s}>{s} px</option>
          ))}
        </select>
        <ColourTool
          title="Text colour"
          label={
            <span className="notes-colour-a">
              <span className="a" style={{ color: '#c62828' }}>A</span>
              <span className="bar" style={{ background: '#c62828' }} />
            </span>
          }
          colours={TEXT_COLOURS}
          onOpen={rememberSelection}
          onClose={releaseSync}
          onPick={(c) => applyColour('foreColor', c)}
        />
        <ColourTool
          title="Highlight colour"
          label={
            <span className="notes-colour-a">
              <span className="a notes-hilite">A</span>
              <span className="bar" style={{ background: '#ffe066' }} />
            </span>
          }
          colours={HILITE_COLOURS}
          onOpen={rememberSelection}
          onClose={releaseSync}
          onPick={(c) => applyColour('hiliteColor', c)}
        />
        <span className="notes-sep" />
        <Tool cmd="justifyLeft" label={<Icon name="alignLeft" />} title="Align text left" />
        <Tool cmd="justifyCenter" label={<Icon name="alignCenter" />} title="Centre text" />
        <Tool cmd="justifyRight" label={<Icon name="alignRight" />} title="Align text right" />
        <Tool cmd="justifyFull" label={<Icon name="alignJustify" />} title="Justify text" />
        <span className="notes-sep" />
        <Tool cmd="insertUnorderedList" label="• List" title="Bulleted list" />
        <Tool cmd="insertOrderedList" label="1. List" title="Numbered list" />
        <span className="notes-sep" />
        <Tool cmd="outdent" label={<Icon name="outdent" />} title="Decrease indent" />
        <Tool cmd="indent" label={<Icon name="indent" />} title="Increase indent" />
        <span className="notes-sep" />
        <Tool cmd="removeFormat" label="Clear" title="Clear formatting" />
      </div>

      {/* Image controls appear only with an image picked, so the main toolbar
          isn't cluttered with things that would do nothing. */}
      {sel && (
        <div className="notes-toolbar notes-toolbar-img">
          <span className="notes-imglabel">Image</span>
          <ImgTool
            title="Float left — text wraps down the right-hand side"
            label="Wrap left"
            styles={{ float: 'left', display: 'inline', margin: '0.4em 1ch 0.4em 0' }}
          />
          <ImgTool
            title="Float right — text wraps down the left-hand side"
            label="Wrap right"
            styles={{ float: 'right', display: 'inline', margin: '0.4em 0 0.4em 1ch' }}
          />
          <ImgTool
            title="No wrap — the image sits on its own line"
            label="No wrap"
            styles={{ float: 'none', display: 'block', margin: '0.6em 0' }}
          />
          <span className="notes-sep" />
          <ImgTool
            title="Place the image on the left"
            label={<Icon name="alignLeft" />}
            styles={{ float: 'none', display: 'block', margin: '0.6em auto 0.6em 0' }}
          />
          <ImgTool
            title="Centre the image"
            label={<Icon name="alignCenter" />}
            styles={{ float: 'none', display: 'block', margin: '0.6em auto' }}
          />
          <ImgTool
            title="Place the image on the right"
            label={<Icon name="alignRight" />}
            styles={{ float: 'none', display: 'block', margin: '0.6em 0 0.6em auto' }}
          />
          <span className="notes-sep" />
          <button
            type="button"
            className="notes-tool"
            title="Back to the image's natural size"
            onMouseDown={(e) => {
              e.preventDefault();
              sel.style.width = '';
              sel.style.height = '';
              sel.removeAttribute('width');
              sel.removeAttribute('height');
              measure();
              save();
            }}
          >
            Reset size
          </button>
        </div>
      )}

      <div
        className="notes-editor"
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        style={fill ? undefined : { minHeight }}
        onInput={() => { save(); measure(); }}
        onBlur={save}
        // the browser's own image drag would fight ours
        onDragStart={(e) => e.preventDefault()}
        onMouseDown={(e) => {
          const t = e.target as HTMLElement;
          if (t.tagName === 'IMG') {
            const img = t as HTMLImageElement;
            setSel(img);
            startMove(e, img);
          } else {
            setSel(null);
          }
        }}
      />

      {box && (
        <div className="img-sel" style={{ left: box.left, top: box.top, width: box.width, height: box.height }}>
          {HANDLES.map((h) => (
            <span key={h.k} className={`img-handle ${h.k}`} onMouseDown={(e) => startResize(e, h)} />
          ))}
          <span className="img-size">{Math.round(box.width)} × {Math.round(box.height)}</span>
        </div>
      )}
    </div>
  );
}
