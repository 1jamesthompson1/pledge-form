// Keep the school's published pledge amounts here so they can be reviewed without
// having to change the form rendering code.

export const money = (amount) => `$${Number(amount || 0).toLocaleString('en-NZ', { minimumFractionDigits: 2 })}`;

// Editable base price and discount schedule. Recommended amounts are calculated from these.
const baseAmount = 4100;
const schoolDiscountSchedule = [0, 0.20, 0.40, 1, 1]; // fraction off full price for child 1..5
const kindergartenDaysPerWeek = 5;

const schoolRecommendedByChild = schoolDiscountSchedule.map((discount) =>
  Math.round(baseAmount * (1 - discount))
);

const kindergartenDailyRate = baseAmount / kindergartenDaysPerWeek;
const kindergartenRecommendedByDays = {
  5: Math.round(kindergartenDailyRate * 5),
  3: Math.round(kindergartenDailyRate * 3),
  2: Math.round(kindergartenDailyRate * 2),
};

const schoolYearTerms = [
  // Ministry of Education 2027 school terms (education.govt.nz/school-terms-and-holidays-dates).
  // Schools choose their own Term 1 start (28 Jan – 3 Feb) and Term 4 end (no later than 17 Dec).
  { start: '2027-01-27', end: '2027-04-09' },
  { start: '2027-04-27', end: '2027-07-02' },
  { start: '2027-07-19', end: '2027-09-24' },
  { start: '2027-10-11', end: '2027-12-17' },
];

// Whole weeks spanning the school year, from the first term start to the last term end.
const schoolYearWeeks = schoolYearTerms.length
  ? Math.ceil((((new Date(`${schoolYearTerms.at(-1).end}T00:00:00`) - new Date(`${schoolYearTerms[0].start}T00:00:00`)) / 86400000) + 1) / 7)
  : 52;

export const pledgeRules = {
  year: 2027,
  returnBy: '2026-12-11',
  schoolName: 'Te Rāwhiti Kindergarten and Te Rā School',
  maxChildrenPerGroup: 5,
  termsPerYear: 4,
  weeksPerYear: 52,
  schoolYearWeeks,
  baseAmount,
  schoolYear: {
    terms: schoolYearTerms,
  },
  school: {
    discountSchedule: schoolDiscountSchedule,
    options: [
      { label: 'Full amount', amount: schoolRecommendedByChild[0] },
      { label: '20% less', amount: schoolRecommendedByChild[1] },
      { label: 'Free', amount: schoolRecommendedByChild[3] },
    ],
    note: `Full price is ${money(baseAmount)} for the first child. The second child is 20% less, the third child is 40% less, and the fourth and fifth children are free.`,
    recommendedByChild: schoolRecommendedByChild,
  },
  kindergarten: {
    dailyRate: kindergartenDailyRate,
    daysPerWeek: kindergartenDaysPerWeek,
    options: [
      { label: '5 days', amount: kindergartenRecommendedByDays[5] },
      { label: '3 days (proportional)', amount: kindergartenRecommendedByDays[3] },
      { label: '2 days', amount: kindergartenRecommendedByDays[2] },
    ],
    note: `Kindergarten is charged at a daily rate of ${money(kindergartenDailyRate)} based on the full ${money(baseAmount)} amount. There are no multi-child discounts for kindergarten.`,
    recommendedByDays: kindergartenRecommendedByDays,
  },
  disbursementPerChild: 400,
};
