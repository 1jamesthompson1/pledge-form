import PDFDocument from 'pdfkit';

const money = (n) => `$${Number(n || 0).toLocaleString('en-NZ', { minimumFractionDigits: 2 })}`;

function sectionHeader(doc, title) {
  doc.moveDown(0.9).font('Helvetica-Bold').fontSize(12).fillColor('#2c6280').text(title).fillColor('black');
}

function labelValue(doc, label, value) {
  doc.font('Helvetica-Bold').fontSize(10).text(`${label}:`, { continued: true }).font('Helvetica').text(` ${value || ''}`);
}

function childrenLines(pledge, kind) {
  const lines = [];
  for (let i = 1; i <= 5; i++) {
    const name = pledge[`${kind}${i}Name`];
    if (!name) continue;
    if (kind === 'school') {
      lines.push(`${name} — Class ${pledge[`${kind}${i}Class`] || ''} — Amount ${money(pledge[`${kind}${i}Amount`])} (disbursement ${money(pledge[`${kind}${i}Disbursement`])})`);
    } else {
      lines.push(`${name} — Age ${pledge[`${kind}${i}Age`] || ''}, ${pledge[`${kind}${i}Days`] || ''} days/week — Amount ${money(pledge[`${kind}${i}Amount`])} (disbursement ${money(pledge[`${kind}${i}Disbursement`])})`);
    }
  }
  return lines;
}

function custodyDetails(pledge) {
  const count = Number(pledge.custodyArrangementCount || 0);
  if (!count) return [];
  const parts = [];
  for (let i = 0; i < count; i++) {
    const children = [];
    for (let j = 1; j <= 5; j++) {
      if (pledge[`custody-${i}-school${j}`] === 'on') children.push(pledge[`school${j}Name`] || `School child ${j}`);
      if (pledge[`custody-${i}-kindergarten${j}`] === 'on') children.push(pledge[`kindergarten${j}Name`] || `Kindergarten child ${j}`);
    }
    parts.push([
      `Arrangement ${i + 1} — children: ${children.join(', ') || 'none'}`,
      `Living arrangements: ${pledge[`custody-${i}-livingArrangements`] || ''}`,
      `Legal restrictions: ${pledge[`custody-${i}-legalRestrictions`] || ''}`,
    ].join('\n'));
  }
  return parts;
}

export async function buildPledgePdf(pledge) {
  const doc = new PDFDocument({ margin: 48, size: 'A4' });
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  doc.font('Helvetica-Bold').fontSize(18).fillColor('#183b56').text('Special Character Pledge', { align: 'center' });
  doc.font('Helvetica').fontSize(10).fillColor('#5d6b70').text(`Submitted ${pledge.receivedAt || new Date().toISOString()}`, { align: 'center' }).fillColor('black');

  sectionHeader(doc, 'Parent / guardian');
  labelValue(doc, 'Name', pledge.parentName);
  labelValue(doc, 'Email', pledge.email);
  if (pledge.startDate) labelValue(doc, 'Start date', pledge.startDate);

  sectionHeader(doc, 'School children');
  const schoolLines = childrenLines(pledge, 'school');
  if (schoolLines.length) schoolLines.forEach((line) => doc.font('Helvetica').fontSize(10).text(line));
  else doc.font('Helvetica').fontSize(10).text('None');

  sectionHeader(doc, 'Kindergarten / Nursery children');
  const kindyLines = childrenLines(pledge, 'kindergarten');
  if (kindyLines.length) kindyLines.forEach((line) => doc.font('Helvetica').fontSize(10).text(line));
  else doc.font('Helvetica').fontSize(10).text('None');

  sectionHeader(doc, 'Pledge summary');
  labelValue(doc, 'Total pledge', money(pledge.totalPledge));
  labelValue(doc, 'Disbursement total', money(pledge.disbursement));
  labelValue(doc, 'Supplementary donation', money(pledge.supplementaryDonation));
  labelValue(doc, 'Payment plan', pledge.paymentPlan);

  if (pledge.custodyApplies === 'on') {
    sectionHeader(doc, 'Custody arrangements');
    custodyDetails(pledge).forEach((text) => doc.font('Helvetica').fontSize(10).text(text));
  }

  sectionHeader(doc, 'Signature');
  labelValue(doc, 'Signed by', pledge.signature);
  labelValue(doc, 'Date', pledge.signatureDate);

  doc.font('Helvetica-Oblique').fontSize(9).fillColor('#5d6b70')
    .moveDown(1.5)
    .text('This pledge was submitted electronically via the school pledge form.');

  doc.end();
  return done;
}
