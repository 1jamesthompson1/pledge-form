import PDFDocument from 'pdfkit';
import { money, pledgeRules } from './pledgeConfig.js';

const FONT = 'Helvetica';
const BOLD = 'Helvetica-Bold';
const OBLIQUE = 'Helvetica-Oblique';
const NAVY = '#183b56';
const TEAL = '#2c6280';
const GRAY = '#5d6b70';
const FAINT = '#9aa5ab';

// Same wording as the front-end form (src/main.js consentGroups).
const consentGroups = {
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
  eotc: [
    'I agree to my child taking part in local walks.',
    'I understand that risks are associated with EOTC activities and cannot be completely eliminated.',
    'I understand that the school will identify hazards and manage those risks.',
    'I understand that I can ask the school questions about activities.',
  ],
  photos: [
    'My child may be photographed at school, kindergarten / nursery and EOTC events.',
    'Photos may be published on the school website or newsletter using first name only.',
    'Photos may be displayed on social media without names.',
  ],
};

const termDates = pledgeRules.schoolYear?.terms || [];
const totalSchoolWeeks = (() => {
  if (!termDates.length) return pledgeRules.weeksPerYear;
  const days = termDates.reduce((total, term) => {
    const start = new Date(`${term.start}T00:00:00`);
    const end = new Date(`${term.end}T00:00:00`);
    return total + Math.round((end - start) / 86400000) + 1;
  }, 0);
  return Math.ceil(days / 7);
})();

function scaleFor(startDate) {
  if (!startDate) return { weeks: totalSchoolWeeks, factor: 1 };
  const date = new Date(`${startDate}T00:00:00`);
  let days = 0;
  for (const term of termDates) {
    const termStart = new Date(`${term.start}T00:00:00`);
    const termEnd = new Date(`${term.end}T00:00:00`);
    const effective = date > termStart ? date : termStart;
    if (effective <= termEnd) days += Math.round((termEnd - effective) / 86400000) + 1;
  }
  const weeks = days > 0 ? Math.ceil(days / 7) : 0;
  return { weeks, factor: totalSchoolWeeks > 0 ? weeks / totalSchoolWeeks : 1 };
}

const display = (value) => (value === undefined || value === null || value === '' ? '—' : String(value));

function ensureSpace(doc, needed = 70) {
  if (doc.page.height - doc.y < needed) doc.addPage();
}

function sectionHeader(doc, number, eyebrow, title) {
  ensureSpace(doc);
  doc.moveDown(0.7);
  doc.font(BOLD).fontSize(9).fillColor(TEAL).text(`${number}  ${eyebrow.toUpperCase()}`);
  doc.font(BOLD).fontSize(13).fillColor(NAVY).text(title);
  doc.fillColor('black');
}

function heading(doc, text) {
  ensureSpace(doc);
  doc.moveDown(0.5).font(BOLD).fontSize(11).fillColor(NAVY).text(text);
  doc.fillColor('black');
}

function labelValue(doc, label, value) {
  ensureSpace(doc, 40);
  doc.font(BOLD).fontSize(10).text(`${label}:`, { continued: true })
    .font(FONT).text(` ${display(value)}`);
}

function consentList(doc, title, key, pledge) {
  heading(doc, title);
  consentGroups[key].forEach((text, index) => {
    const checked = pledge[`${key}-${index}`] === 'on';
    doc.font(FONT).fontSize(9.5).fillColor(checked ? 'black' : FAINT)
      .text(`${checked ? '[x]' : '[ ]'} ${text}`);
  });
  doc.fillColor('black');
}

function amountTable(doc, headers, rows) {
  const widths = [210, 145, 144];
  const x0 = doc.x;
  const y0 = doc.y;
  let x = x0;
  doc.font(BOLD).fontSize(9).fillColor(TEAL);
  headers.forEach((header, index) => {
    doc.text(header, x, y0, { width: widths[index], align: index === 0 ? 'left' : 'right', lineBreak: false });
    x += widths[index];
  });
  doc.fillColor('black').font(FONT).fontSize(9.5);
  for (const row of rows) {
    if (doc.page.height - doc.y < 20) doc.addPage();
    const y = doc.y;
    x = x0;
    row.forEach((cell, index) => {
      doc.text(String(cell), x, y, { width: widths[index], align: index === 0 ? 'left' : 'right', lineBreak: false });
      x += widths[index];
    });
    doc.x = x0;
    doc.y = y + 14;
  }
  doc.y += 2;
}

function childAmountRows(pledge, kind, amountOf) {
  const rows = [];
  for (let i = 1; i <= pledgeRules.maxChildrenPerGroup; i++) {
    const name = pledge[`${kind}${i}Name`];
    if (!name) continue;
    const arg = kind === 'school' ? i - 1 : pledge[`kindergarten${i}Days`];
    rows.push([name, amountOf(arg), money(pledge[`${kind}${i}Amount`])]);
  }
  return rows;
}

function childDisbursementRows(pledge, kind, recommended) {
  const rows = [];
  for (let i = 1; i <= pledgeRules.maxChildrenPerGroup; i++) {
    const name = pledge[`${kind}${i}Name`];
    if (!name) continue;
    rows.push([name, recommended, money(pledge[`${kind}${i}Disbursement`])]);
  }
  return rows;
}

function totalFromFields(pledge) {
  let total = 0;
  for (let i = 1; i <= pledgeRules.maxChildrenPerGroup; i++) {
    total += Number(pledge[`school${i}Amount`] || 0) + Number(pledge[`kindergarten${i}Amount`] || 0);
    total += Number(pledge[`school${i}Disbursement`] || 0) + Number(pledge[`kindergarten${i}Disbursement`] || 0);
  }
  return total + Number(pledge.supplementaryDonation || 0);
}

export async function buildPledgePdf(pledge) {
  const doc = new PDFDocument({ margin: 48, size: 'A4' });
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const { weeks, factor } = scaleFor(pledge.startDate);
  const scale = (amount) => Math.round(amount * factor * 100) / 100;
  const schoolRecommended = (index) => money(scale(pledgeRules.school.recommendedByChild[index] ?? pledgeRules.school.recommendedByChild.at(-1)));
  const kindyRecommended = (days) => money(scale(pledgeRules.kindergarten.recommendedByDays[days] ?? pledgeRules.kindergarten.recommendedByDays[5]));
  const disbursementRecommended = money(scale(pledgeRules.disbursementPerChild));

  doc.font(BOLD).fontSize(20).fillColor(NAVY).text('Special Character Pledge Form', { align: 'center' });
  doc.font(BOLD).fontSize(14).fillColor(TEAL).text(`${pledgeRules.year}`, { align: 'center' });
  doc.font(FONT).fontSize(8.5).fillColor(GRAY)
    .text('Te Ra School · Te Rawhiti Kindergarten', { align: 'center' })
    .text(`Submitted ${pledge.submittedAt || pledge.receivedAt || new Date().toISOString()}`, { align: 'center' });
  doc.fillColor('black')
    .moveDown(0.5)
    .moveTo(48, doc.y).lineTo(547.28, doc.y).lineWidth(1).strokeColor(TEAL).stroke()
    .moveDown(0.6);

  sectionHeader(doc, '01', 'Whanau details', 'Who is completing this pledge?');
  labelValue(doc, 'Parent / guardian name', pledge.parentName);
  labelValue(doc, 'Email address', pledge.email);
  if (pledge.startDate) labelValue(doc, 'Start date', pledge.startDate);

  heading(doc, 'School children');
  labelValue(doc, 'Count', pledge.schoolChildCount);
  for (let i = 1; i <= pledgeRules.maxChildrenPerGroup; i++) {
    const name = pledge[`school${i}Name`];
    if (!name) continue;
    labelValue(doc, `School child ${i}`, `${name} — Class ${display(pledge[`school${i}Class`])}`);
  }

  heading(doc, 'Kindergarten / Nursery children');
  labelValue(doc, 'Count', pledge.kindergartenChildCount);
  for (let i = 1; i <= pledgeRules.maxChildrenPerGroup; i++) {
    const name = pledge[`kindergarten${i}Name`];
    if (!name) continue;
    labelValue(doc, `Kindergarten / Nursery child ${i}`, `${name} — Age ${display(pledge[`kindergarten${i}Age`])}, ${display(pledge[`kindergarten${i}Days`])} days/week`);
  }

  sectionHeader(doc, '02', 'Care and participation', 'Consents and commitments');
  consentList(doc, 'Medical consent', 'medical', pledge);
  consentList(doc, 'EOTC blanket consent for local walks', 'eotc', pledge);
  consentList(doc, 'Code of conduct and special character', 'conduct', pledge);

  sectionHeader(doc, '03', 'Contribution', `Our pledge for ${pledgeRules.year}`);
  if (pledge.startDate) {
    doc.font(OBLIQUE).fontSize(8.5).fillColor(GRAY)
      .text(`These recommended amounts are based on a start date of ${pledge.startDate} and cover ${weeks} of ${totalSchoolWeeks} weeks of the ${pledgeRules.year} school year.`)
      .fillColor('black');
  }
  heading(doc, 'Pledge amounts');
  amountTable(doc, ['Student', 'Recommended', 'Agreed amount'], [
    ...childAmountRows(pledge, 'school', schoolRecommended),
    ...childAmountRows(pledge, 'kindergarten', kindyRecommended),
  ]);
  labelValue(doc, 'Supplementary donation / pay it forward', money(pledge.supplementaryDonation));

  heading(doc, 'Disbursement amounts');
  amountTable(doc, ['Student', 'Contribution', 'Amount'], [
    ...childDisbursementRows(pledge, 'school', disbursementRecommended),
    ...childDisbursementRows(pledge, 'kindergarten', disbursementRecommended),
  ]);
  labelValue(doc, 'Disbursement contribution', money(pledge.disbursement));

  const total = Number(pledge.totalPledge || 0) || totalFromFields(pledge);
  doc.moveDown(0.3).font(BOLD).fontSize(11).fillColor(NAVY)
    .text(`Total pledge for ${pledgeRules.year}: ${money(total)}`);
  doc.fillColor('black');
  labelValue(doc, 'Per term', money(total / pledgeRules.termsPerYear));
  labelValue(doc, 'Per week (calendar year)', money(total / pledgeRules.weeksPerYear));
  labelValue(doc, 'Indicative payment plan', pledge.paymentPlan);
  labelValue(doc, 'Pledge comments', pledge.pledgeComments);

  sectionHeader(doc, '04', 'Communication', 'Photo permissions');
  consentList(doc, 'Please choose any permissions that apply', 'photos', pledge);

  sectionHeader(doc, '05', 'Be prepared', 'Emergency contacts');
  [['Contact 1', 1], ['Contact 2', 2]].forEach(([label, number]) => {
    heading(doc, label);
    labelValue(doc, 'Name', pledge[`emergencyContact${number}Name`]);
    labelValue(doc, 'Phone number', pledge[`emergencyContact${number}Phone`]);
    labelValue(doc, 'Relationship', pledge[`emergencyContact${number}Relationship`]);
  });

  sectionHeader(doc, '06', 'Family arrangements', 'Custodial arrangements');
  const custodyApplies = pledge.custodyApplies === 'on';
  doc.font(FONT).fontSize(9.5).fillColor(custodyApplies ? 'black' : FAINT)
    .text(`${custodyApplies ? '[x]' : '[ ]'} My children live across more than one household or have special custodial arrangements.`);
  doc.fillColor('black');
  if (custodyApplies) {
    const count = Number(pledge.custodyArrangementCount || 1);
    for (let i = 0; i < count; i++) {
      heading(doc, `Custodial arrangement ${i + 1}`);
      const children = [];
      for (let j = 1; j <= pledgeRules.maxChildrenPerGroup; j++) {
        if (pledge[`custody-${i}-school${j}`] === 'on') children.push(pledge[`school${j}Name`] || `School child ${j}`);
        if (pledge[`custody-${i}-kindergarten${j}`] === 'on') children.push(pledge[`kindergarten${j}Name`] || `Kindergarten / Nursery child ${j}`);
      }
      labelValue(doc, 'Children affected', children.join(', ') || 'None');
      labelValue(doc, 'Living arrangements', pledge[`custody-${i}-livingArrangements`]);
      labelValue(doc, 'Legal restrictions', pledge[`custody-${i}-legalRestrictions`]);
      labelValue(doc, 'Financial arrangements', pledge[`custody-${i}-financialArrangements`]);
      labelValue(doc, 'Further details', pledge[`custody-${i}-explanation`]);
    }
  }

  sectionHeader(doc, '07', 'Declaration', 'Confirm and submit');
  doc.font(OBLIQUE).fontSize(9)
    .text('I confirm that the information above is correct and that I will advise the school of changes.');
  labelValue(doc, 'Parent / guardian signature (typed)', pledge.signature);
  labelValue(doc, 'Date', pledge.signatureDate);

  doc.font(OBLIQUE).fontSize(9).fillColor(GRAY)
    .moveDown(1.2)
    .text('This pledge was submitted electronically via the school pledge form.', { align: 'center' });

  doc.end();
  return done;
}
