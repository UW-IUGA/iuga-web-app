// Read at the moment of an animation rather than once, so flipping the OS
// setting applies to the next one without a reload.
export const prefersReducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
