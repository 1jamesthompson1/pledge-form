// Single source of truth for the form definition.
// Used by the form (src/main.js) and synced to the functions backend
// (functions/src/formDefinition.js) for the generated pledge PDF and email.
// Keep all sections, consent wording and field labels here — never
// duplicate them elsewhere.

export const interpolate = (template, vars = {}) =>
  template.replace(/\{(\w+)\}/g, (_, key) => (vars[key] === undefined ? '' : String(vars[key])));

export const formatLongDate = (isoDate) => {
  if (!isoDate) return '';
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(isoDate);
  return date.toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' });
};

export const sections = [
  { number: '01', title: 'Who is completing this pledge?' },
  { number: '02', title: 'Medical consent' },
  { number: '03', title: 'EOTC consent' },
  { number: '04', title: 'Photo permissions' },
  { number: '05', title: 'Code of conduct and special character' },
  { number: '06', title: 'Our pledge for {year}' },
  { number: '07', title: 'Emergency contacts' },
  { number: '08', title: 'Custodial arrangements' },
  { number: '09', title: 'Confirm and submit' },
];

export const sectionTitle = (section, year) => interpolate(section.title, { year });

export const consentGroups = {
  medical: [
    'In an emergency, school staff may act on my behalf.',
    'School staff may administer pain relief, such as paracetamol, after seeking verbal permission.',
    'Basic first aid may be given, including an icepack, plaster, arnica cream or hypercal cream.',
    "I will tell the school about changes in my child's medical circumstances.",
  ],
  conduct: [
    'Treat others with respect and uphold their privacy.',
    'Work in partnership with staff for the benefit of all students.',
    'Respect and adhere to the school values and special character.',
    'Use digital technology and social media safely and responsibly.',
    'Act in accordance with school rules, procedures and legal obligations.',
  ],
  photos: [
    'My child may be photographed at school, kindergarten / nursery and EOTC events.',
    'Photos may be published on the school website or newsletter using first name only.',
    'Photos may be displayed on social media without names.',
  ],
};

export const eotcStatements = [
  'I understand that risks are associated with EOTC activities and cannot be completely eliminated.',
  'I understand that the school will identify hazards and manage those risks.',
  'I understand that I can ask the school questions about activities.',
];

export const eotcLegends = {
  school: 'School EOTC blanket consent for',
  kindergarten: 'Kindergarten / Nursery EOTC blanket consent for',
};

export const labels = {
  childrenQuestion: 'How many children are you completing this pledge for?',
  schoolChildren: 'School children',
  kindergartenChildren: 'Kindergarten / Nursery children',
  schoolChild: 'School child {n}',
  kindergartenChild: 'Kindergarten / Nursery child {n}',
  childName: 'Child full name',
  childClass: 'Class for {year}',
  childAge: 'Age at {termStart}',
  daysPerWeek: 'Days per week',
  noSchoolChildren: 'No school children added.',
  noKindergartenChildren: 'No Kindergarten / Nursery children added.',
  parentName: 'Parent / guardian name',
  email: 'Email address',
  count: 'Count',
  startDate: 'Start date',
  startDateSummary: 'Recommended amounts cover {weeks} of {totalWeeks} weeks of the {year} school year.',
  noStartDateNote: 'No start date set — full recommended amounts apply.',
  pledgeAmounts: 'Pledge amounts',
  disbursementAmounts: 'Disbursement amounts',
  student: 'Student',
  recommended: 'Recommended',
  agreedAmount: 'Agreed amount',
  supplementaryDonation: 'Supplementary donation / pay it forward',
  disbursementContribution: 'Disbursement contribution',
  totalPledge: 'Total pledge for {year}',
  perTerm: 'Per term',
  perWeek: 'Per week (school year)',
  paymentPlan: 'Indicative payment plan',
  pledgeComments: 'Pledge comments',
  emergencyContact: 'Contact {n}',
  emergencyName: 'Name',
  emergencyPhone: 'Phone number',
  emergencyRelationship: 'Relationship',
  emergencyComments: 'Comments about emergency contacts',
  custodyToggle: 'My children live across more than one household or have special custodial arrangements.',
  custodyArrangement: 'Custodial arrangement {n}',
  custodyChildrenAffected: 'Select the children affected',
  custodyLivingArrangements: 'What are the living arrangements for the affected children?',
  custodyLegalRestrictions: 'Is there anyone who does not have legal rights of access to the children? Please include their name and any relevant details, or write "None".',
  custodyFinancialArrangements: 'What are the financial arrangements for the pledge, disbursements, camps and other costs?',
  custodyExplanation: 'Further details about the custodial arrangement',
  custodyAddAnother: 'Add another custodial arrangement',
  custodyRemove: 'Remove arrangement',
  anythingElse: 'Anything else to add?',
  signature: 'Parent / guardian signature (typed)',
  signatureDate: 'Date',
};
