import { preloadFont } from 'troika-three-text';

let started = false;

/**
 * drei <Text> fetches its default font on first use, which leaves 3D scenes dark for a few
 * seconds. Warm it (same default font, common glyphs) once per page load.
 */
export function warmTextFont(): void {
  if (started) return;
  started = true;
  try {
    preloadFont({ characters: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!?.,:-#' }, () => {});
  } catch {
    /* best effort */
  }
}
