// Single source of truth for the form definition.
// Used by the form (src/main.js) and synced to the functions backend
// (functions/src/formDefinition.js) for the generated pledge PDF and email.
// Keep all sections, consent wording and field labels here — never
// duplicate them elsewhere.
//
// Templating: every string is written with {token} placeholders and resolved
// at render time via interpolate(). Standard tokens provided everywhere:
//   {year}, {schoolName}, {child} (child/children by total count),
//   {schoolChild}, {kindergartenChild} (per-group counts), {n}, {date},
//   {termStart}, {weeks}, {totalWeeks}
// Unfinished copy is marked with the consistent "PLACEHOLDER: ..." prefix.

export const interpolate = (template, vars = {}) =>
  template.replace(/\{(\w+)\}/g, (_, key) => (vars[key] === undefined ? '' : String(vars[key])));

export const childWord = (count) => (count === 1 ? 'child' : 'children');

export const formatLongDate = (isoDate) => {
  if (!isoDate) return '';
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(isoDate);
  return date.toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' });
};

export const formatLongDateOrdinal = (isoDate) => {
  if (!isoDate) return '';
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(isoDate);
  const day = date.getDate();
  const suffix = (day % 10 === 1 && day % 100 !== 11) ? 'st'
    : (day % 10 === 2 && day % 100 !== 12) ? 'nd'
      : (day % 10 === 3 && day % 100 !== 13) ? 'rd' : 'th';
  return `${day}${suffix} ${date.toLocaleDateString('en-NZ', { month: 'long', year: 'numeric' })}`;
};

export const sections = [
  { number: '01', title: 'Who is completing this pledge?' },
  { number: '02', title: 'Commitment to our special character' },
  { number: '03', title: 'Code of conduct' },
  { number: '04', title: 'Medical consent' },
  { number: '05', title: 'Medical information' },
  { number: '06', title: 'Emergency contacts' },
  { number: '07', title: 'EOTC blanket consent {year} for local walks' },
  { number: '08', title: 'Photo permissions' },
  { number: '09', title: 'Custodial arrangements' },
  { number: '10', title: 'Our pledge for {year}' },
  { number: '11', title: 'Confirm and submit' },
];

export const sectionTitle = (section, year) => interpolate(section.title, { year });

export const consentGroups = {
  commitment: [
    'Respect the special character guiding principles and to uphold the code of conduct.',
    'Attend two working bees this year.',
    'Commit to supporting the class teacher by volunteering as a driver or helper for trips, camps and other activities coordinated by the class parent liaison.',
    'Participate in the annual fair and other events.',
    'If my/our pledge is less than the indicated base figure, or during the year I/we suffer financial hardship, I/we commit to communicate with the Trust Administrator.',
    'Commit to regular attendance at parent hui.',
    'Commit to maintaining healthy home rhythms (e.g., wholesome food, play, sleep).',
    "Commit to limiting child's access and exposure to screens and digital devices.",
  ],
  medical: [
    'In an emergency school staff may act on my behalf.',
    'School staff may administer pain relief (e.g., Paracetamol). You will be contacted for verbal permission if this is needed.',
    'To allow basic first aid for my {child}, e.g., an icepack, sticking plaster, arnica cream or hypercal cream.',
    "I will inform {schoolName} as soon as possible of any changes in the medical circumstances of my/our {child}.",
    "If prescribed medication is needed to be administered, a designated adult will be assigned to do this. I will ensure that prescribed medication is clearly labelled, securely fastened and handed to the office or their kindergarten teacher with instructions on its administration. This includes asthma.",
    "Any medical cost not covered by ACC or a community service card will be paid by me/us."
    
  ],
  conduct: [
    'Treat others with respect and uphold their right to privacy.',
    'Work together in partnership with staff for the benefit of all students.',
    'Respect and adhere to our school values and character.',
    'Use digital technology and social media safely and responsibly whilst respecting the privacy of other (e.g. sharing images).',
    'Understand that the kindergarten and school have a process to resolve concerns and complaints, which can be found on the school website.',
    'Act in accordance with school rules, procedures, and legal obligations.',
  ],
  photos: [
    'I give permission for my {child} to be photographed at {schoolName} and EOTC events.',
    'I give consent for photographs of my {child} to be published on the {schoolName} website or in the newsletter (when childrens names are used in the text it will be first name only).',
    'I give consent for photographs of my {child} to be displayed on social media for example Facebook and Instagram (no names will be used).'
  ],
};

export const eotcStatementsSchool = [
  'I agree to my {schoolChild} taking part in local walks. I acknowledge the need for them to behave responsibly.',
  'I understand that there are risks associated with involvement in the schools EOTC events and that these risks cannot be completely eliminated.',
  'I understand that the school/kindergarten will identify any foreseeable risks and hazards and implement correct management procedures to eliminate or minimise those risks.',
  'I acknowledge that in order to gain a better understanding of the risks involved I am able to asks any questions of the school/kindergarten about the activities in which my child will be involved.'
];

export const eotcStatementsKindergarten = [
  'PLACEHOLDER: Kindergarten EOTC statement 1',
  'PLACEHOLDER: Kindergarten EOTC statement 2',
  'PLACEHOLDER: Kindergarten EOTC statement 3',
];

export const eotcLegends = {
  school: 'School EOTC blanket consent for',
  kindergarten: 'Kindergarten / Nursery EOTC blanket consent for',
};

export const labels = {
  returnByTop: 'Please submit this form by {date}.',
  returnByBottom: 'Reminder: please return your form by {date}.',
  commitmentIntro: "I/we express support to {schoolName} and confirm our {child}'s enrolment for {year} by pledging our special character contribution and by agreeing to:",
  conductIntro: 'This applies to all forms of communication while on school grounds or at another venue where students and/or staff are assembled for school purposes such as a camp or sports matches.<br><br>{schoolName} expects parents, caregivers and visitors to:',
  medicalIntro: 'I/we agree that:',
  medicalInfoIntro: 'Please note any medical conditions or health information for each child.',
  medicalInfoOutro: 'It is very important that this information is kept up to date throughout the year, please contact the school office if anything changes.',
  emergencyIntro: 'Please provide two people the school can contact in an emergency.',
  emergencyOutro: 'Please keep these details up to date throughout the year by contacting the school office.',
  medicalInfoPlaceholder: 'Any medical conditions, allergies or other health information',
  photosIntro: 'At times we capture moments of learning, play and community life at {schoolName}. These images help us share the richness of the programme with Whānau. Please let us know your preferences for how your child\'s photos may be used.',
eotcIntro: 'This Education Outside The Classroom (EOTC) form is to cover low risk events which occur during the course of a Kindergarten or School day and are planned to conclude prior to 2:45pm.',
  eotcEndNote: 'During {year}, the Kindergarten and School teachers do not need to seek specific consent for local walks with their class. They will inform whānau when an event is planned or when a walk is part of the their weekly programme, e.g., walking day.',
  eotcWalksIntro: 'Typical events of this nature are walks to:',
  eotcWalks: [
    'Nearby parks and places, the beach, the community orchard',
    'the farm across the road from school and land surrounding the school',
    'the school grounds',
  ],
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
  pledgeAmounts: 'Special Character Donation',
  pledgeOtherCostsNote: 'Other costs such as camps, trips and cultural events may incur additional costs. These costs will be advised at the time, and are to be paid via Kindo.',
  recommendedAmountsTitle: 'Recommended amounts',
  pledgeIntro: 'This donation is used for the upkeep and maintenance of our schools special character.',
  pledgeInfoTitle: 'More information about Special Character Donations',
  pledgeInfoBody: 'At this time of year we prepare our budget for the following year. Knowing what parents will contribute is an important part of our planning process. This money enables us to deliver Waldorf education and to manage the financial commitments we have as the owners of this land and the buildings.<br><br>Unlike state schools, our land and building are owned by the Kapiti Waldorf Trust. Government funding supports essential maintenance of integrated buildings, although many of the initiatives that enhance our special character, support our curriculum, or improve our grounds, rely on funding from our school community. Donations allow us to care for our environment in a way that reflects Waldorf values.<br><br>We ask that all parents submit a special character donation that allows us to keep doing what we are doing. The school has used a donation based approach since foundation days back in 1996. It is based on mutual trust and cooperation which we prefer to a fees based system. A donation system allows us as a community to collectively carry specific family hardship situations. It also allows whānau to claim back up to 1/3 of their donated contribution with IRD.',
  disbursementAmounts: 'Disbursement',
  student: 'Student',
  recommended: 'Recommended',
  agreedAmount: 'Agreed amount',
  supplementaryDonation: 'Supplementary donation / pay it forward',
  disbursementIntro: 'This disbursement donation covers the materials and meals (kindergarten) supplied to your children during the kindergarten and school year.',
  disbursementInfoTitle: 'More information about Disbursements',
  disbursementInfoBody: 'We aim to procure quality materials and ingredients as this is an important aspect of our special character.<br><br>Examples of disbursement items in the school are crayons, pencils, painting paper, handwork, cooking and woodwork materials. In the kindergarten this includes nutritional ingredients, painting, paper and crayons. We buy these on your behalf, and in return we do not give you stationery or shopping lists.',
  totalPledgeHeading: 'Total Pledge',
  perYear: 'Per year',
  perTerm: 'Per term',
  perWeek: 'Per week (school year)',
  paymentPlan: 'Indicative payment plan',
  kindoInfoTitle: 'Setting up Kindo',
  kindoInfoBody: 'PLACEHOLDER: Add information about setting up Kindo here.',
  paymentPlanNote: 'Our expenses are regular throughout the year, and it is best for the school and kindergarten cash flow if you pay by regular instalments starting in January. Some families prefer to pay a lump sum at the start of the year.',
  paymentHeading: 'Payment of pledges',
  pledgeComments: 'Pledge comments',
  pledgeCommentsNote: "Payments are made through Kindo. If you don't have an account see below for how to set one up. THIS IS TO BE COMPLETED...",
  emergencyContact: 'Contact {n}',
  emergencyName: 'Name',
  emergencyPhone: 'Phone number',
  emergencyRelationship: 'Relationship',
  emergencyComments: 'Comments about emergency contacts',
  custodyToggle: 'My children live across more than one household or have special custodial arrangements.',
  custodyArrangement: 'Custodial arrangement {n}',
  custodyChildrenAffected: 'Select the children affected',
  custodyLivingArrangements: 'What is the regular rhythm for where your children will be living?',
  custodyLegalRestrictions: 'Is there any person who does not have the legal right of access to your children? If so please provide a copy of the court order to the school office.',
  custodyFinancialArrangements: 'What are the financial arrangements for the pledge, disbursements, camps and other costs (i.e 50/50 etc)?',
  custodyExplanation: 'Further details about the custodial arrangement',
  custodyAddAnother: 'Add another custodial arrangement',
  custodyRemove: 'Remove arrangement',
  anythingElse: 'Anything else to add?',
  signature: 'Parent / guardian signature (typed)',
  signatureDate: 'Date',
};
