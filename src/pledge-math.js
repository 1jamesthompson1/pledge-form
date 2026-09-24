// Pure school-year / pro-rating maths, kept free of the DOM so it can be unit
// tested directly. `main.js` imports these to render and recalculate the form.
import { pledgeRules } from './pledge-config.js';

export const parseStartDate = (raw) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(raw))) return null;
  const date = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  const [year, month, day] = raw.split('-').map(Number);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
};

// Whole weeks spanning the school year, from the first term start to the last
// term end, counted per term and rounded up to whole weeks.
export const totalSchoolWeeks = (() => {
  const terms = pledgeRules.schoolYear?.terms || [];
  if (!terms.length) return pledgeRules.weeksPerYear;
  return terms.reduce((total, term) => {
    const start = new Date(`${term.start}T00:00:00`);
    const end = new Date(`${term.end}T00:00:00`);
    const days = Math.round((end - start) / 86400000) + 1;
    return total + Math.ceil(days / 7);
  }, 0);
})();

export const schoolYearMonths = (() => {
  const terms = pledgeRules.schoolYear?.terms || [];
  if (!terms.length) return 12;
  const start = new Date(`${terms[0].start}T00:00:00`);
  const end = new Date(`${terms.at(-1).end}T00:00:00`);
  return end.getMonth() - start.getMonth() + 1;
})();

const fullPeriods = {
  weeks: totalSchoolWeeks,
  factor: 1,
  terms: pledgeRules.termsPerYear,
  spanWeeks: pledgeRules.schoolYearWeeks,
  months: schoolYearMonths,
};

// Returns how much of the school year remains from `date`: whole weeks left,
// the scaling factor, remaining terms, spanned weeks and months. With no date
// (or no term data) the full year is returned unchanged.
export const computeScaling = (date) => {
  const terms = pledgeRules.schoolYear?.terms || [];
  if (!date || !terms.length) return { ...fullPeriods };
  let weeks = 0;
  for (const term of terms) {
    const termStart = new Date(`${term.start}T00:00:00`);
    const termEnd = new Date(`${term.end}T00:00:00`);
    const effective = date > termStart ? date : termStart;
    if (effective <= termEnd) weeks += Math.ceil((Math.round((termEnd - effective) / 86400000) + 1) / 7);
  }
  const firstStart = new Date(`${terms[0].start}T00:00:00`);
  const effectiveStart = date > firstStart ? date : firstStart;
  const lastEnd = new Date(`${terms.at(-1).end}T00:00:00`);
  const spanDays = Math.round((lastEnd - effectiveStart) / 86400000) + 1;
  return {
    weeks,
    factor: totalSchoolWeeks > 0 ? weeks / totalSchoolWeeks : 1,
    terms: Math.max(1, terms.filter((term) => date <= new Date(`${term.end}T00:00:00`)).length),
    spanWeeks: Math.max(1, Math.ceil(spanDays / 7)),
    months: Math.max(1, (lastEnd.getFullYear() - effectiveStart.getFullYear()) * 12 + (lastEnd.getMonth() - effectiveStart.getMonth()) + 1),
  };
};
