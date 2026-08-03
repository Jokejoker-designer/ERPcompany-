const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function getFocusable(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => !el.hasAttribute("disabled") && el.offsetParent !== null,
  );
}

export function trapFocus(container: HTMLElement): () => void {
  const prev = document.activeElement as HTMLElement | null;
  const nodes = getFocusable(container);
  if (nodes[0]) nodes[0].focus();

  function onKey(e: KeyboardEvent) {
    if (e.key !== "Tab") return;
    const list = getFocusable(container);
    if (!list.length) {
      e.preventDefault();
      return;
    }
    const first = list[0];
    const last = list[list.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else if (document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  container.addEventListener("keydown", onKey);
  return () => {
    container.removeEventListener("keydown", onKey);
    prev?.focus?.();
  };
}
