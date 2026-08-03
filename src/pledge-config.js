// Keep the school's published 2026 amounts here so they can be reviewed without
// having to change the form rendering code.
export const pledgeRules = {
  maxChildrenPerGroup: 10,
  termsPerYear: 4,
  weeksPerTerm: 10,
  school: {
    options: [
      { label: 'Standard amount', amount: 4100 },
      { label: 'Second-child amount', amount: 4000 },
      { label: '20% less', amount: 3280 },
      { label: '40% less', amount: 2460 },
    ],
    note: 'The school booklet lists $4,100 for the first child, $4,000 / $3,280 for the second child, and $4,000 / $2,460 for the third child. Select the agreed amount for each child.',
    recommendedByChild: [4100, 4000, 2460],
  },
  kindergarten: {
    recommendedByDays: { 5: 4100, 3: 2460, 2: 1640 },
    options: [
      { label: '5 days', amount: 4100 },
      { label: '3 days (proportional)', amount: 2460 },
      { label: '2 days', amount: 1640 },
    ],
  },
  disbursementPerChild: 400,
};

export const money = (amount) => `$${Number(amount || 0).toLocaleString('en-NZ', { minimumFractionDigits: 2 })}`;
