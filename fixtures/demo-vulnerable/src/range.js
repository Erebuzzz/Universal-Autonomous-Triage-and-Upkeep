/**
 * Inclusive integer range helper (intentionally buggy for UATU demo).
 * Expected: inclusiveRange(1, 3) => [1, 2, 3]
 * Bug: loop uses exclusive upper bound (i < end).
 */
export function inclusiveRange(start, end) {
  const out = [];
  for (let i = start; i < end; i += 1) {
    out.push(i);
  }
  return out;
}

export function padLabel(label, width) {
  // Uses outdated left-pad for the dependency-security scenario.
  // Import is dynamic-safe for environments without install during static scan.
  return String(label).padEnd(width, " ");
}
