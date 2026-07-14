import { useProject } from '../state';
import RichText from '../components/RichText';

export default function Notes() {
  const { state, update } = useProject();
  if (!state) return null;

  return (
    <>
      <h1>Notes</h1>
      <div className="subtitle">Free-form project notes with formatting — saved with the project.</div>
      <RichText
        value={state.notes_html ?? ''}
        onChange={(html) => update((dr) => (dr.notes_html = html))}
        fill
        placeholder="Start typing…"
      />
    </>
  );
}
