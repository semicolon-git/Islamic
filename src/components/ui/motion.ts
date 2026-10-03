/** "smooth" unless the visitor asked for reduced motion (CSS `scroll-behavior` does not cover explicit JS scrolling). */
export function scrollBehavior(): ScrollBehavior {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}
