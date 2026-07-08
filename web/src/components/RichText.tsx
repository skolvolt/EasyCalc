import { useEffect, useRef, type ReactNode } from 'react';

/** execCommand is deprecated but is still the simplest cross-browser rich-text
 *  editing for a local app, and every Chromium/WebKit build supports it. */
const exec = (cmd: string, value?: string) => document.execCommand(cmd, false, value);

interface Props {
  value: string;
  onChange: (html: string) => void;
  minHeight?: number;
  placeholder?: string;
}

/** A small WordPad-style rich-text editor backed by a contentEditable div. */
export default function RichText({ value, onChange, minHeight = 260, placeholder }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Sync external changes (undo, project switch) in — but never while the user
  // is typing, so the caret doesn't jump.
  useEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el && el.innerHTML !== (value ?? '')) {
      el.innerHTML = value ?? '';
    }
  }, [value]);

  const save = () => { if (ref.current) onChange(ref.current.innerHTML); };
  const run = (cmd: string, val?: string) => { ref.current?.focus(); exec(cmd, val); save(); };

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

  return (
    <div className="richtext">
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
        <Tool cmd="insertUnorderedList" label="• List" title="Bulleted list" />
        <Tool cmd="insertOrderedList" label="1. List" title="Numbered list" />
        <span className="notes-sep" />
        <Tool cmd="removeFormat" label="Clear" title="Clear formatting" />
      </div>

      <div
        className="notes-editor"
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        style={{ minHeight }}
        onInput={save}
        onBlur={save}
      />
    </div>
  );
}
