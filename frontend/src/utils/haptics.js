export function hapticTap(pattern = 10) {
  if (typeof window === 'undefined') return;
  if (!('navigator' in window) || typeof navigator.vibrate !== 'function') return;
  navigator.vibrate(pattern);
}

