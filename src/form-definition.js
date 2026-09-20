// Single source of truth for the form definition.
// Used by the form (src/main.js) and synced to the functions backend
// (functions/src/formDefinition.js) for the generated pledge PDF and email.
// Keep all sections, consent wording and field labels here — never
// duplicate them elsewhere.
//
// Templating: every string is written with {token} placeholders and resolved
// at render time via interpolate(). Standard tokens provided everywhere:
//   {year}, {schoolName}, {child} (child/children by total count),
//   {theirFace} (their face is / their faces are by total count),
//   {schoolChild}, {kindergartenChild} (per-group counts), {n}, {date},
//   {termStart}, {weeks}, {totalWeeks}, {trustAdminContact}
// Long-form copy (the privacy statement) lives in src/privacy-statement.html
// and is imported with ?raw by src/main.js.
// Unfinished copy is marked with the consistent "PLACEHOLDER: ..." prefix.

export const interpolate = (template, vars = {}) =>
  template.replace(/\{(\w+)\}/g, (_, key) => (vars[key] === undefined ? '' : String(vars[key])));

export const childWord = (count) => (count === 1 ? 'child' : 'children');

export const theirFacePhrase = (count) => (count === 1 ? 'their face is' : 'their faces are');

export const trustAdministratorPhrase = (email) => (email
  ? `<a href="mailto:${email}">${email}</a>`
  : 'the pledge form administrator');

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
    'If {possessive} pledge is less than the indicated base figure, or during the year {pronounLower} suffer financial hardship, {pronounLower} commit to communicate with the Trust Administrator.',
    'Commit to regular attendance at parent hui.',
    'Commit to maintaining healthy home rhythms (e.g., wholesome food, play, sleep).',
    "Commit to limiting {possessive} {child}'s access and exposure to screens and digital devices.",
  ],
  medical: [
    'In an emergency school staff may act on {possessive} behalf.',
    'School staff may administer pain relief (e.g., Paracetamol). You will be contacted for verbal permission if this is needed.',
    'To allow basic first aid for {possessive} {child}, e.g., an icepack, sticking plaster, arnica cream or hypercal cream.',
    "{pronoun} will inform {schoolName} as soon as possible of any changes in the medical circumstances of {possessive} {child}.",
    "If prescribed medication needs to be administered, a designated adult will be assigned to do this. {pronoun} will ensure that prescribed medication is clearly labelled, securely fastened and handed to the office or their kindergarten teacher with instructions on its administration. This includes asthma.",
    "Any medical cost not covered by ACC or a community service card will be paid by {objectPronoun}."
    
  ],
  conduct: [
    'Treat others with respect and uphold their right to privacy.',
    'Work together in partnership with staff for the benefit of all students.',
    'Respect and adhere to our school values and character.',
    'Use digital technology and social media safely and responsibly whilst respecting the privacy of others (e.g. sharing images).',
    'Understand that the kindergarten and school have a process to resolve concerns and complaints, which can be found on the school website.',
    'Act in accordance with school rules, procedures, and legal obligations.',
  ],
  photos: [
    "{pronoun} give consent for {possessive} {child} to be photographed at kindergarten or school, including during EOTC events (walks, excursions, etc.).",
    "{pronoun} give consent for photographs of {possessive} {child} to be published on the school's website or in the school newsletter. When names are used in the text, only first names will be used.",
    "{pronoun} give consent for photographs of {possessive} {child} to be used on the school's social media platforms (e.g., Instagram and Facebook), where {possessive} {child} may appear in the background or from the side and {theirFace} not recognisable. No names will be used.",
    "{pronoun} give consent for photographs of {possessive} {child} to be used on the school's social media platforms (e.g., Instagram and Facebook), where {possessive} {child} may be clearly identifiable and {theirFace} visible. No names will be used.",
  ],
};

export const eotcStatementsSchool = [
  '{pronoun} agree to {possessive} {schoolChild} taking part in local walks. {pronoun} acknowledge the need for them to behave responsibly.',
  "{pronoun} understand that there are risks associated with involvement in the school's EOTC events and that these risks cannot be completely eliminated.",
  '{pronoun} understand that the school/kindergarten will identify any foreseeable risks and hazards and implement correct management procedures to eliminate or minimise those risks.',
  '{pronoun} acknowledge that in order to gain a better understanding of the risks involved {pronounLower} {beVerb} able to ask any questions of the school/kindergarten about the activities in which {possessive} {child} will be involved.'
];

export const eotcStatementsKindergarten = [
  '{pronoun} give permission to visit the listed locations as part of our regular excursions.',
  '{pronoun} understand that there are risks associated with involvement in the kindergarten EOTC events and that while {pronounLower} minimize the risks, they cannot all be eliminated.',
  '{pronoun} understand that kindergarten identifies any foreseeable risks or hazards and implements correct management procedures to eliminate or minimise those risks.',
  '{pronoun} acknowledge that to gain a better understanding of the risks involved {pronounLower} have read the available RAMS for each of the destinations (available on the website, in the office, and on noticeboards onsite).',
  '{pronoun} confirm {pronounLower} understand the Ratio: Kaiako/ Ākonga 2:16',
  '{pronoun} confirm {pronounLower} understand the method of Transport: Walking',
  'Planned Route: Please see the individual routes for each walk on the RAMs',
];

export const eotcWalksKindergarten = [
  'Raumati South Beach',
  'Queen Elizabeth Farm',
  'Big Dipper',
  'Leinster Ave Park',
  'Te Rā School Site',
  'Tennis Court Road Park',
];

export const eotcLegends = {
  school: 'School EOTC blanket consent for',
  kindergarten: 'Kindergarten / Nursery EOTC blanket consent for',
};

export const labels = {
  returnByTop: 'Please submit this form by {date}.',
  returnByBottom: 'Reminder: please return your form by {date}.',
  commitmentIntro: "{pronoun} express support to {schoolName} and confirm {possessive} {child}'s enrolment for {year} by pledging {possessive} special character contribution and by agreeing to:",
  conductIntro: 'This applies to all forms of communication while on school grounds or at another venue where students and/or staff are assembled for school purposes such as a camp or sports matches.<br><br>{schoolName} expects parents, caregivers and visitors to:',
  medicalIntro: '{pronoun} agree that:',
  medicalInfoIntro: 'Please note any medical conditions or health information for each child.',
  medicalInfoOutro: 'It is very important that this information is kept up to date throughout the year. Please contact the school office if anything changes.',
  emergencyIntro: 'Please provide two people the school can contact in an emergency.',
  emergencyOutro: 'Please keep these details up to date throughout the year by contacting the school office.',
  medicalInfoPlaceholder: 'Any medical conditions, allergies or other health information',
  photosIntro: 'At times we capture moments of learning, play and community life at {schoolName}. These images help us share the richness of the programme with Whānau. Please let us know your preferences for how your {child}\'s photos may be used.',
eotcIntro: 'This Education Outside The Classroom (EOTC) form is to cover low risk events which occur during the course of a Kindergarten or School day and are planned to conclude prior to 2:45pm.',
  eotcEndNote: 'During {year}, the Kindergarten and School teachers do not need to seek specific consent for local walks with their class. They will inform whānau when an event is planned or when a walk is part of their weekly programme, e.g., walking day.',
  eotcWalksIntro: 'Typical events of this nature are walks to:',
  eotcWalks: [
    'Nearby parks and places, the beach, the community orchard',
    'the farm across the road from school and land surrounding the school',
    'the school grounds',
  ],
  eotcKindergartenIntro: 'This consent covers low risk events which occur during a kindergarten day and are planned to conclude before 2:30pm.',
  eotcWalksIntroKindergarten: 'This includes walking as a class to:',
  eotcKindergartenBlurb: 'During {year} kaiako will not seek specific consent for local walks with their class. They will inform whānau when an event is planned and seek separate consent for this or when a walk is part of the weekly rhythm.<br><br>It is important that this form is completed before the start of the year for all students who will be participating in EOTC events as described above. Details on this form are confidential to kindergarten kaiako and kaiārahi supervising EOTC activities.',
  eotcKindergartenConsent: '{pronoun} confirm that {pronounLower} have read and understood the above information and consent to the attendance of {possessive} child on regular excursions.',
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
  otherParentName: 'Other parent / guardian name',
  otherParentEmail: 'Other parent / guardian email address',
  familyTypeLegend: 'Which best describes your family situation?',
  familyTogether: 'Both parents / guardians are pledging together.',
  familySplit: 'Parents / guardians are pledging separately (e.g., separated families or single parents).',
  email: 'Email address',
  emailTooltip: 'This is the email address we will use to set up your Kindo account.',
  count: 'Count',
  startDate: 'Start date',
  startDateSummary: 'Recommended amounts cover {weeks} of {totalWeeks} teaching weeks of the {year} school year.',
  noStartDateNote: 'No start date set — full recommended amounts apply.',
  splitPaymentNote: 'The totals below are the total amount expected to be paid for each child. For split families where both parents contribute it is left up to the parents to agree on how to split the payment. The school will not be able to advise on what the other parent is paying.',
  pledgeAmounts: 'Special Character Donation',
  pledgeOtherCostsNote: 'Other costs such as camps, trips and cultural events may incur additional costs. These costs will be advised at the time, and are to be paid via Kindo.',
  recommendedAmountsTitle: 'Recommended amounts',
  pledgeIntro: "This donation is used for the upkeep and maintenance of our school's special character.",
  pledgeInfoTitle: 'More information about Special Character Donations',
  pledgeInfoBody: 'At this time of year we prepare our budget for the following year. Knowing what parents will contribute is an important part of our planning process. This money enables us to deliver Waldorf education and to manage the financial commitments we have as the owners of this land and the buildings.<br><br>Unlike state schools, our land and buildings are owned by the Kapiti Waldorf Trust. Government funding supports essential maintenance of integrated buildings, although many of the initiatives that enhance our special character, support our curriculum, or improve our grounds, rely on funding from our school community. Donations allow us to care for our environment in a way that reflects Waldorf values.<br><br>We ask that all parents submit a special character donation that allows us to keep doing what we are doing. The school has used a donation-based approach since foundation days back in 1996. It is based on mutual trust and cooperation which we prefer to a fee-based system. A donation system allows us as a community to collectively carry specific family hardship situations. It also allows whānau to claim back up to 1/3 of their donated contribution with IRD.',
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
  kindoInfoTitle: 'Kindo account setup and payment information',
  kindoPaymentsNote: 'We use <strong>Kindo</strong> to make payments. See below for more information.',
  kindoInfoBody: "<p>To set up your account, download the Kindo app or sign up online <a href='https://shop.kindo.co.nz/app/login' target='_blank' rel='noopener'>here</a>.</p><p>Please use the <strong>same email address you provided to the school</strong> so that your {child} can be automatically linked to your account.</p><p>You can also set up automatic payments to keep your Kindo account topped up. See more information <a href='https://support.mykindo.co.nz/portal/en/kb/articles/how-to-set-up-an-automatic-payment' target='_blank' rel='noopener'>here</a>.</p><p><strong>Kindo Bank Account:</strong><br>The Growth Collective Limited<br><strong>02-1257-0090149-000</strong><br>The reference for your payment will be your customer number. See links above.</p>",
  paymentPlanNote: 'Our expenses are regular throughout the year, and it is best for the school and kindergarten cash flow if you pay by regular instalments starting in January. Some families prefer to pay a lump sum at the start of the year.',
  paymentHeading: 'Payment of pledges',
  pledgeComments: 'Pledge comments',
  emergencyContact: 'Contact {n}',
  emergencyName: 'Name',
  emergencyPhone: 'Phone number',
  emergencyRelationship: 'Relationship',
  emergencyComments: 'Comments about emergency contacts',
  custodyToggle: '{possessive} children live across more than one household or have special custodial arrangements.',
  custodyArrangement: 'Custodial arrangement {n}',
  custodyChildrenAffected: 'Select the children affected',
  custodyLivingArrangements: 'What is the regular rhythm for where your children will be living?',
  custodyLegalRestrictions: 'Is there any person who does not have the legal right of access to your children? If so please provide a copy of the court order to the school office.',
  custodyFinancialArrangements: 'What are the financial arrangements for the pledge, disbursements, camps and other costs (i.e. 50/50, etc.)?',
  custodyFinancialTooltip: 'If the other parent/caregiver states something different to you in their pledge, the school will contact you to clarify. When agreed this split will be set up automatically.',
  custodyExplanation: 'Further details about the custodial arrangement',
  custodyAddAnother: 'Add another custodial arrangement',
  custodyRemove: 'Remove arrangement',
  privacyStatementTitle: 'Privacy statement',
  photosWithdrawNote: 'You can change or withdraw your photo consent at any time by contacting the school office.',
  privacyNotice: 'We handle your information as described in our privacy statement. By submitting this form, you confirm you have read and agree to it.',
  anythingElse: 'Anything else to add?',
  confirmStatement: '{pronoun} confirm that the information above is correct and that {pronounLower} will advise the school of changes.',
  signature: 'Parent / guardian signature (typed)',
  otherParentSignature: 'Other parent / guardian signature (typed)',
  signatureDate: 'Date',
};
