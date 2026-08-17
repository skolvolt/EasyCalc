import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import Icon from './Icon';

/** execCommand is deprecated but is still the simplest cross-browser rich-text
 *  editing for a local app, and every Chromium/WebKit build supports it. */
const exec = (cmd: string, value?: string) => document.execCommand(cmd, false, value);

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

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
  useEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el && el.innerHTML !== (value ?? '')) {
      el.innerHTML = value ?? '';
      setSel(null); // the old node went with the replaced markup
    }
  }, [value]);

  const save = () => { if (ref.current) onChange(ref.current.innerHTML); };
  const run = (cmd: string, val?: string) => { ref.current?.focus(); exec(cmd, val); save(); };

  /** Position the handle frame over the selected image, in host coordinates. */
  const measure = useCallback(() => {
    const el = ref.current, host = hostRef.current;
    if (!sel || !el || !host || !el.contains(sel)) { setBox(null); return; }
    const i = sel.getBoundingClientRect(), h = host.getBoundingClientRect();
    setBox({ left: i.left - h.left, top: i.top - h.top, width: i.width, height: i.height });
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
    const startX = e.clientX, startY = e.clientY;
    const startW = r.width, startH = r.height;
    const ratio = startH / startW || 1;
    const maxW = ref.current ? ref.current.clientWidth - 40 : 1600;

    const onMove = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) * h.x;
      const dy = (ev.clientY - startY) * h.y;
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
      img.style.margin = left ? '4px 14px 8px 0' : '4px 0 8px 14px';
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
          onChange={(e) => { run('formatBlock', e.target.value); e.currentTarget.value = ''; }}
        >
          <option value="" disabled>Style…</option>
          <option value="H1">Heading 1</option>
          <option value="H2">Heading 2</option>
          <option value="H3">Heading 3</option>
          <option value="P">Normal</option>
        </select>
        <select
          className="notes-tool"
          title="Font size"
          defaultValue=""
          onChange={(e) => { run('fontSize', e.target.value); e.currentTarget.value = ''; }}
        >
          <option value="" disabled>Size…</option>
          <option value="2">Small</option>
          <option value="3">Normal</option>
          <option value="5">Large</option>
          <option value="6">X-Large</option>
        </select>
        <span className="notes-sep" />
        <Tool cmd="justifyLeft" label={<Icon name="alignLeft" />} title="Align text left" />
        <Tool cmd="justifyCenter" label={<Icon name="alignCenter" />} title="Centre text" />
        <Tool cmd="justifyRight" label={<Icon name="alignRight" />} title="Align text right" />
        <Tool cmd="justifyFull" label={<Icon name="alignJustify" />} title="Justify text" />
        <span className="notes-sep" />
        <Tool cmd="insertUnorderedList" label="• List" title="Bulleted list" />
        <Tool cmd="insertOrderedList" label="1. List" title="Numbered list" />
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
            styles={{ float: 'left', display: 'inline', margin: '4px 14px 8px 0' }}
          />
          <ImgTool
            title="Float right — text wraps down the left-hand side"
            label="Wrap right"
            styles={{ float: 'right', display: 'inline', margin: '4px 0 8px 14px' }}
          />
          <ImgTool
            title="No wrap — the image sits on its own line"
            label="No wrap"
            styles={{ float: 'none', display: 'block', margin: '8px 0' }}
          />
          <span className="notes-sep" />
          <ImgTool
            title="Place the image on the left"
            label={<Icon name="alignLeft" />}
            styles={{ float: 'none', display: 'block', margin: '8px auto 8px 0' }}
          />
          <ImgTool
            title="Centre the image"
            label={<Icon name="alignCenter" />}
            styles={{ float: 'none', display: 'block', margin: '8px auto' }}
          />
          <ImgTool
            title="Place the image on the right"
            label={<Icon name="alignRight" />}
            styles={{ float: 'none', display: 'block', margin: '8px 0 8px auto' }}
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
