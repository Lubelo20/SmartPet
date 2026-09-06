import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Source-inspection tests, in the style this repo already uses for the auth
 * provider: vitest runs in a node environment with no DOM, so a dialog cannot
 * be rendered or measured here. These pin the STRUCTURE that made the mobile
 * bug possible, not the behaviour — they would survive a semantics-preserving
 * rewrite, and they cannot prove the button is reachable on a real phone.
 * Only a phone can prove that.
 *
 * The bug: the panel scrolled as one block inside a `fixed inset-0` overlay.
 * On a phone the keyboard shrinks the visual viewport but not the layout
 * viewport, so the footer — with "Add pet" — sat behind the keyboard and no
 * scrolling reached it.
 */
const source = readFileSync("components/ui/Modal.tsx", "utf8");

describe("Modal layout", () => {
  it("sizes itself to the visual viewport, which is what the keyboard shrinks", () => {
    expect(source).toContain("visualViewport");
    // Height alone is not enough: iOS scrolls the layout viewport under the
    // keyboard, so the dialog must follow offsetTop or its header is clipped.
    expect(source).toContain("vv.offsetTop");
    // Both events matter: resize fires when the keyboard opens, scroll when
    // iOS shifts the visual viewport within the layout viewport.
    expect(source).toContain('addEventListener("resize"');
    expect(source).toContain('addEventListener("scroll"');
  });

  it("removes its viewport listeners when closed", () => {
    // A dialog that keeps listening after unmount re-renders a component that
    // is gone, on every keyboard open, for the life of the page.
    expect(source).toContain('removeEventListener("resize"');
    expect(source).toContain('removeEventListener("scroll"');
  });

  it("falls back to CSS when the browser has no visualViewport", () => {
    // Older browsers and SSR must still get a usable dialog rather than a
    // zero-height one.
    expect(source).toContain("visual === null ? undefined");
    expect(source).toMatch(/typeof window === "undefined" \? null : window\.visualViewport/);
  });

  it("scrolls the body only, so the footer cannot be pushed off screen", () => {
    // The panel must be a flex column that does NOT scroll as a whole.
    expect(source).toMatch(/className="relative w-full[^"]*flex flex-col/);
    expect(source).not.toMatch(/className="relative w-full[^"]*overflow-y-auto/);
    // The body scrolls and is allowed to shrink; without min-h-0 a flex child
    // defaults to min-height:auto and pushes the footer out again.
    expect(source).toMatch(/\{children && <div className="[^"]*overflow-y-auto[^"]*min-h-0[^"]*flex-1/);
  });

  it("does not re-run its focus effect when the caller re-renders", () => {
    // Callers pass an inline arrow for onClose, so it is a new function on
    // every render of the page — and the page re-renders about twice a second
    // because the simulator ticks. If the focus effect depended on onClose it
    // would tear down and set up continuously, and BOTH halves move focus:
    // cleanup restores it to the trigger, setup sends it to the first field.
    // On a phone that dismissed the keyboard the instant it opened.
    expect(source).not.toContain("}, [open, onClose]);");
    expect(source).toContain("onCloseRef");
    // Escape must still close: the handler reads the latest callback from the
    // ref rather than closing over a stale one.
    expect(source).toContain("onCloseRef.current()");
  });

  it("keeps the header and footer outside the scrolling area", () => {
    expect(source).toMatch(/border-b border-line-soft shrink-0/);
    expect(source).toMatch(/\{footer && <div className="[^"]*shrink-0/);
  });
});

/**
 * Same convention, different file: the pet mutators. The page closes the
 * dialog before the write resolves, so a refused write has no route to the
 * user except the mutator's own catch. Without it the pet silently never
 * appeared — the exact "not working" a phone user reported.
 */
describe("pet mutators report failure", () => {
  const provider = readFileSync("hooks/useFeederData.tsx", "utf8");

  it.each(["createPet", "updatePet", "deletePet"])("%s catches and toasts", (name) => {
    const start = provider.indexOf(`const ${name} = useCallback`);
    expect(start).toBeGreaterThan(-1);
    const body = provider.slice(start, provider.indexOf("}, [services, toast]);", start));
    expect(body).toContain("try {");
    expect(body).toContain("catch (e)");
    expect(body).toMatch(/tone: "critical"/);
  });
});
