import { ClientSecretCredential } from '@azure/identity';

const tenantId = process.env.AZURE_TENANT_ID;
const clientId = process.env.AZURE_CLIENT_ID;
const clientSecret = process.env.AZURE_CLIENT_SECRET;
const workbookPath = process.env.EXCEL_WORKBOOK_PATH;
const tableName = process.env.EXCEL_TABLE_NAME || 'Pledges';

const MAX_CHILDREN_PER_GROUP = 5;

const CONSENT_GROUPS = [
  ['Medical consent', 'medical', 4],
  ['Conduct consent', 'conduct', 5],
  ['EOTC consent', 'eotc', 4],
  ['Photos consent', 'photos', 3],
];

function buildColumns() {
  const cols = [
    'Parent / guardian name',
    'Email address',
    'Submitted at',
    'Start date',
    'School children count',
    'Kindergarten / Nursery children count',
    'Total pledge',
    'Disbursement total',
    'Supplementary donation',
    'Payment plan',
    'Pledge comments',
    'Signature',
    'Signature date',
  ];

  for (let i = 1; i <= MAX_CHILDREN_PER_GROUP; i++) {
    cols.push(
      `School child ${i} name`,
      `School child ${i} class`,
      `School child ${i} amount`,
      `School child ${i} disbursement`,
    );
  }

  for (let i = 1; i <= MAX_CHILDREN_PER_GROUP; i++) {
    cols.push(
      `Kindergarten child ${i} name`,
      `Kindergarten child ${i} age`,
      `Kindergarten child ${i} days/week`,
      `Kindergarten child ${i} amount`,
      `Kindergarten child ${i} disbursement`,
    );
  }

  for (let i = 1; i <= 2; i++) {
    cols.push(
      `Emergency contact ${i} name`,
      `Emergency contact ${i} phone`,
      `Emergency contact ${i} relationship`,
    );
  }

  for (const [label, key, count] of CONSENT_GROUPS) {
    for (let i = 0; i < count; i++) {
      cols.push(`${label} ${i + 1}`);
    }
  }

  cols.push('Custody arrangements apply', 'Custody details');
  return cols;
}

export const EXCEL_COLUMNS = buildColumns();

function yesNo(value) {
  return value === 'on' ? 'Yes' : 'No';
}

function custodyDetails(pledge) {
  const count = Number(pledge.custodyArrangementCount || 0);
  if (!count) return '';
  const parts = [];
  for (let i = 0; i < count; i++) {
    const children = [];
    for (let j = 1; j <= MAX_CHILDREN_PER_GROUP; j++) {
      if (pledge[`custody-${i}-school${j}`] === 'on') children.push(pledge[`school${j}Name`] || `School child ${j}`);
      if (pledge[`custody-${i}-kindergarten${j}`] === 'on') children.push(pledge[`kindergarten${j}Name`] || `Kindergarten child ${j}`);
    }
    parts.push(
      `Arrangement ${i + 1}: children [${children.join(', ') || 'none'}]; ` +
      `living arrangements: ${pledge[`custody-${i}-livingArrangements`] || ''}; ` +
      `legal restrictions: ${pledge[`custody-${i}-legalRestrictions`] || ''}; ` +
      `financial arrangements: ${pledge[`custody-${i}-financialArrangements`] || ''}; ` +
      `further details: ${pledge[`custody-${i}-explanation`] || ''}`,
    );
  }
  return parts.join(' || ');
}

export function toRow(pledge) {
  const values = [];
  const push = (v) => values.push(v === undefined || v === null ? '' : v);

  push(pledge.parentName);
  push(pledge.email);
  push(pledge.submittedAt || pledge.receivedAt);
  push(pledge.startDate || '');
  push(Number(pledge.schoolChildCount) || 0);
  push(Number(pledge.kindergartenChildCount) || 0);
  push(Number(pledge.totalPledge) || 0);
  push(Number(pledge.disbursement) || 0);
  push(Number(pledge.supplementaryDonation) || 0);
  push(pledge.paymentPlan || '');
  push(pledge.pledgeComments || '');
  push(pledge.signature);
  push(pledge.signatureDate);

  for (let i = 1; i <= MAX_CHILDREN_PER_GROUP; i++) {
    push(pledge[`school${i}Name`]);
    push(pledge[`school${i}Class`]);
    push(Number(pledge[`school${i}Amount`]) || 0);
    push(Number(pledge[`school${i}Disbursement`]) || 0);
  }

  for (let i = 1; i <= MAX_CHILDREN_PER_GROUP; i++) {
    push(pledge[`kindergarten${i}Name`]);
    push(pledge[`kindergarten${i}Age`]);
    push(pledge[`kindergarten${i}Days`]);
    push(Number(pledge[`kindergarten${i}Amount`]) || 0);
    push(Number(pledge[`kindergarten${i}Disbursement`]) || 0);
  }

  for (let i = 1; i <= 2; i++) {
    push(pledge[`emergencyContact${i}Name`]);
    push(pledge[`emergencyContact${i}Phone`]);
    push(pledge[`emergencyContact${i}Relationship`]);
  }

  for (const [, key, count] of CONSENT_GROUPS) {
    for (let i = 0; i < count; i++) {
      push(yesNo(pledge[`${key}-${i}`]));
    }
  }

  push(yesNo(pledge.custodyApplies));
  push(custodyDetails(pledge));

  return [values];
}

export async function appendPledgeToExcel(pledge) {
  if (!workbookPath) {
    throw new Error('EXCEL_WORKBOOK_PATH is not configured');
  }
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Azure AD credentials are not configured');
  }

  const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
  const token = await credential.getToken('https://graph.microsoft.com/.default');

  const url = `https://graph.microsoft.com/v1.0/${workbookPath}/workbook/tables/${encodeURIComponent(tableName)}/rows/add`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values: toRow(pledge) }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Graph Excel API error ${response.status}: ${text}`);
  }
}
