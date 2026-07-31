import { describe, expect, it } from 'vitest';
import { calculateWeightedTotal, DEFAULT_GRADE_SCHEME, mapGradeFromScheme } from './grade-calc';

describe('calculateWeightedTotal', () => {
  it('returns null for no marks', () => {
    expect(calculateWeightedTotal([])).toBeNull();
  });

  it('computes a simple single-mark percentage', () => {
    expect(calculateWeightedTotal([{ score: 45, maxMarks: 50, weight: 1 }])).toBeCloseTo(90, 5);
  });

  it('weights multiple assessments proportionally to their weight', () => {
    // Midterm worth 30%, scored 80%; final worth 70%, scored 90%.
    const total = calculateWeightedTotal([
      { score: 40, maxMarks: 50, weight: 30 }, // 80%
      { score: 45, maxMarks: 50, weight: 70 }, // 90%
    ]);
    expect(total).toBeCloseTo(0.3 * 80 + 0.7 * 90, 5); // 87
  });

  it('normalizes by the weight actually present when an assessment is missing', () => {
    // Only the 30%-weight assessment exists (e.g. the 70% final hasn't
    // happened yet) - the average should be over what's recorded, not
    // diluted by a phantom zero for the missing one.
    const total = calculateWeightedTotal([{ score: 40, maxMarks: 50, weight: 30 }]);
    expect(total).toBeCloseTo(80, 5);
  });

  it('ignores a mark with a non-positive maxMarks instead of dividing by zero', () => {
    const total = calculateWeightedTotal([
      { score: 10, maxMarks: 0, weight: 50 },
      { score: 45, maxMarks: 50, weight: 50 },
    ]);
    expect(total).toBeCloseTo(90, 5);
  });
});

describe('mapGradeFromScheme', () => {
  it('maps percentages to the default A-F bands', () => {
    expect(mapGradeFromScheme(95)).toBe('A');
    expect(mapGradeFromScheme(90)).toBe('A'); // boundary is inclusive
    expect(mapGradeFromScheme(89.9)).toBe('B');
    expect(mapGradeFromScheme(75)).toBe('C');
    expect(mapGradeFromScheme(65)).toBe('D');
    expect(mapGradeFromScheme(59.9)).toBe('F');
    expect(mapGradeFromScheme(0)).toBe('F');
  });

  it('works with a custom scheme, unsorted', () => {
    const scheme = [
      { min: 0, grade: 'Fail' },
      { min: 50, grade: 'Pass' },
      { min: 85, grade: 'Distinction' },
    ];
    expect(mapGradeFromScheme(92, scheme)).toBe('Distinction');
    expect(mapGradeFromScheme(60, scheme)).toBe('Pass');
    expect(mapGradeFromScheme(10, scheme)).toBe('Fail');
  });

  it('defaults to DEFAULT_GRADE_SCHEME when no scheme is passed', () => {
    expect(mapGradeFromScheme(100)).toBe(mapGradeFromScheme(100, DEFAULT_GRADE_SCHEME));
  });
});
