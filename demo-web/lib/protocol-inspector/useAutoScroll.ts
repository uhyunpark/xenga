import { useRef, useEffect, useCallback } from "react";

/**
 * Auto-scrolls a container to the bottom when deps change.
 * Suppresses auto-scroll when the user has manually scrolled up;
 * re-enables when the user scrolls back to the bottom.
 */
export function useAutoScroll(...deps: unknown[]) {
  const ref = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);

  const handleScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    shouldAutoScroll.current = distanceFromBottom < 30;
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  useEffect(() => {
    if (shouldAutoScroll.current) {
      ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return ref;
}
