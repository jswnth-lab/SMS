export interface WeightedMark {
  score: number;
  maxMarks: number;
  weight: number;
}

export interface GradeBand {
  /** Inclusive lower bound, 0-100. Bands are matched by the highest band whose min the percentage clears. */
  min: number;
  grade: string;
}

/** A plain A/B/C/D/F scheme with 10-point bands - a sane default, not the only valid scheme a school might use. */
export const DEFAULT_GRADE_SCHEME: GradeBand[] = [
  { min: 90, grade: 'A' },
  { min: 80, grade: 'B' },
  { min: 70, grade: 'C' },
  { min: 60, grade: 'D' },
  { min: 0, grade: 'F' },
];

/**
 * Weighted percentage total across a set of marks: each mark contributes
 * `(score / maxMarks) * weight`, and the sum is normalized by the sum of
 * weights actually present - so a term missing one assessment doesn't
 * silently score as if the student got a zero on it, it just recomputes
 * the average over the assessments that exist.
 *
 * Returns null for an empty input (nothing to average) rather than 0,
 * since "no assessments recorded" and "scored zero on everything" are
 * different facts callers need to be able to tell apart.
 */
export function calculateWeightedTotal(marks: WeightedMark[]): number | null {
  if (marks.length === 0) return null;

  let weightedSum = 0;
  let totalWeight = 0;
  for (const mark of marks) {
    if (mark.maxMarks <= 0) continue;
    weightedSum += (mark.score / mark.maxMarks) * mark.weight;
    totalWeight += mark.weight;
  }
  if (totalWeight <= 0) return null;

  return (weightedSum / totalWeight) * 100;
}

/**
 * Maps a 0-100 percentage to a letter grade using the highest band whose
 * `min` the percentage meets or exceeds. `scheme` need not be sorted by the
 * caller - it's sorted internally (descending by min) before matching.
 */
export function mapGradeFromScheme(percentage: number, scheme: GradeBand[] = DEFAULT_GRADE_SCHEME): string {
  const sorted = [...scheme].sort((a, b) => b.min - a.min);
  const band = sorted.find((b) => percentage >= b.min);
  return band?.grade ?? sorted[sorted.length - 1]?.grade ?? 'F';
}
