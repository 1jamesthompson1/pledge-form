import { describe, expect, it } from 'vitest';
import {
  parseStartDate, totalSchoolWeeks, schoolYearMonths, computeScaling,
} from '../../src/pledge-math.js';

describe('parseStartDate', () => {
  it('accepts a strict YYYY-MM-DD date', () => {
    const date = parseStartDate('2027-07-19');
    expect(date).toBeInstanceOf(Date);
    expect(date.getFullYear()).toBe(2027);
    expect(date.getMonth()).toBe(6);
    expect(date.getDate()).toBe(19);
  });

  it('rejects malformed and impossible dates', () => {
    expect(parseStartDate('19-07-2027')).toBeNull();
    expect(parseStartDate('2027/07/19')).toBeNull();
    expect(parseStartDate('2027-02-30')).toBeNull();
    expect(parseStartDate('')).toBeNull();
    expect(parseStartDate(undefined)).toBeNull();
  });
});

describe('school year totals', () => {
  it('counts the 2027 term weeks', () => {
    expect(totalSchoolWeeks).toBe(40);
    expect(schoolYearMonths).toBe(11);
  });
});

describe('computeScaling', () => {
  it('returns the full year when there is no start date', () => {
    expect(computeScaling(null)).toEqual({
      weeks: 40, factor: 1, terms: 4, spanWeeks: 46, months: 11,
    });
  });

  it('halves the year for a Term 3 start', () => {
    // The README's worked example: ?startDate=2027-07-19
    expect(computeScaling(parseStartDate('2027-07-19'))).toEqual({
      weeks: 20, factor: 0.5, terms: 2, spanWeeks: 22, months: 6,
    });
  });

  it('scales to the final term for a Term 4 start', () => {
    expect(computeScaling(parseStartDate('2027-10-11'))).toEqual({
      weeks: 10, factor: 0.25, terms: 1, spanWeeks: 10, months: 3,
    });
  });

  it('never returns zero weeks/terms', () => {
    const afterYearEnd = computeScaling(parseStartDate('2027-12-18'));
    expect(afterYearEnd.weeks).toBe(0);
    expect(afterYearEnd.factor).toBe(0);
    expect(afterYearEnd.terms).toBeGreaterThanOrEqual(1);
    expect(afterYearEnd.spanWeeks).toBeGreaterThanOrEqual(1);
    expect(afterYearEnd.months).toBeGreaterThanOrEqual(1);
  });

  it('is monotonic: a later start never leaves more weeks than an earlier one', () => {
    const earlier = computeScaling(parseStartDate('2027-04-27'));
    const later = computeScaling(parseStartDate('2027-07-19'));
    expect(later.weeks).toBeLessThanOrEqual(earlier.weeks);
    expect(later.factor).toBeLessThanOrEqual(earlier.factor);
  });
});
