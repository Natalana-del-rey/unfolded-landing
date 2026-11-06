/** Makes a <Mark> wink once. A wink is a moment, so it happens even with reduced motion — nothing moves. */
export function wink(mark: Element | null, ms = 700): void {
  if (!mark) return;
  mark.classList.add('is-winking');
  setTimeout(() => mark.classList.remove('is-winking'), ms);
}
