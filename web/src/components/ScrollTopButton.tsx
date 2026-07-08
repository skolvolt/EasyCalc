import { useEffect, useState } from 'react';

/**
 * Floating "back to top" button — bottom-right, above all content. Appears
 * once the page (or a scrollable inner panel, e.g. the Equipment Schedule's
 * frozen-header grid) has scrolled down, and smooth-scrolls it back to the top.
 */
const THRESHOLD = 400;

/** Inner scroll panels that scroll independently of the window. */
const innerPanels = () =>
  Array.from(document.querySelectorAll<HTMLElement>('.scroll-x.freeze-scroll'));

export default function ScrollTopButton() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const check = () => {
      const scrolled =
        window.scrollY > THRESHOLD || innerPanels().some((el) => el.scrollTop > THRESHOLD);
      setShow(scrolled);
    };
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    // capture phase catches scroll from inner panels (scroll doesn't bubble)
    document.addEventListener('scroll', check, { passive: true, capture: true });
    check();
    return () => {
      window.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
      document.removeEventListener('scroll', check, { capture: true } as EventListenerOptions);
    };
  }, []);

  if (!show) return null;
  return (
    <button
      className="scroll-top-btn"
      title="Back to top"
      aria-label="Back to top"
      onClick={() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        innerPanels().forEach((el) => el.scrollTo({ top: 0, behavior: 'smooth' }));
      }}
    >
      ↑
    </button>
  );
}
