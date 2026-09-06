"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

type ModalProps = {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children?: ReactNode;
  footer?: ReactNode;
  width?: number;
};

/** Everything focusable inside the dialog, in document order. */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ open, title, description, onClose, children, footer, width = 520 }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();

  /**
   * On a phone, opening the keyboard shrinks the VISUAL viewport but leaves
   * the layout viewport — and therefore anything `fixed inset-0` — at full
   * height. The bottom of the dialog then sits behind the keyboard, and no
   * amount of scrolling reaches it: that is how the "Add pet" button became
   * unreachable on mobile. Sizing to visualViewport keeps the whole dialog,
   * footer included, inside the part of the screen the user can actually see.
   *
   * null until measured, and on browsers without the API, so the CSS fallback
   * (inset-0) applies untouched.
   */
  // offsetTop as well as height: iOS scrolls the layout viewport under the
  // keyboard, and a dialog fixed at top:0 would have its header scrolled off.
  /**
   * onClose is read through a ref so the focus effect below can depend on
   * `open` alone. Callers pass an inline arrow — `onClose={() => setX(null)}`
   * — which is a new function on every render of the page, and the page
   * re-renders about twice a second because the simulator ticks. Listing
   * onClose as a dependency therefore tore the effect down and set it up
   * again continuously, and both halves move focus: the cleanup restores it
   * to the trigger, the setup sends it to the first field. On a phone that
   * dismissed the keyboard the instant it opened, so the form could not be
   * typed into at all.
   */
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  const [visual, setVisual] = useState<{ height: number; top: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    const vv = typeof window === "undefined" ? null : window.visualViewport;
    if (!vv) return;
    const update = () => setVisual({ height: vv.height, top: vv.offsetTop });
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    // Remember who opened us, so focus can go back there on close. Without
    // this, closing a dialog dumps keyboard focus at the top of the document.
    restoreTo.current = document.activeElement as HTMLElement | null;

    const panel = panelRef.current;
    const focusables = () =>
      Array.from(panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);

    // Move focus in. The panel itself is the fallback target when the dialog
    // has no focusable content of its own.
    (focusables()[0] ?? panel)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onCloseRef.current(); return; }
      if (e.key !== "Tab") return;

      // Trap: without this, Tab walks out of the dialog and onto the page
      // behind it, which the user cannot see.
      const items = focusables();
      if (items.length === 0) { e.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && (active === first || !panel?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      restoreTo.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-x-0 top-0 bottom-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6"
      style={visual === null ? undefined : { height: visual.height, top: visual.top, bottom: "auto" }}
    >
      {/* Decorative: closing is also on Escape and the labelled close button,
          so this does not need to be a keyboard target of its own. */}
      <div className="absolute inset-0 bg-inverse opacity-40" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className="relative w-full bg-surface rounded-t-2xl sm:rounded-2xl shadow-xl border border-line max-h-full flex flex-col focus:outline-none"
        style={{ maxWidth: width }}
      >
        <div className="flex items-start justify-between gap-4 p-5 border-b border-line-soft shrink-0">
          <div>
            <h3 id={titleId} className="text-base font-semibold text-ink">{title}</h3>
            {description && <p id={descId} className="text-sm text-muted mt-1">{description}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1.5 rounded-lg text-muted hover:bg-surface-2 hover:text-ink-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            <X size={18} />
          </button>
        </div>
        {/* Only the body scrolls. min-h-0 is required: a flex child defaults to
            min-height:auto and would refuse to shrink, pushing the footer out
            of the panel again. */}
        {children && <div className="p-5 overflow-y-auto min-h-0 flex-1">{children}</div>}
        {footer && <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 p-5 border-t border-line-soft bg-canvas rounded-b-2xl shrink-0">{footer}</div>}
      </div>
    </div>
  );
}
