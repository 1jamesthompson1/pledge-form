import { ClientSecretCredential } from '@azure/identity';
import { money, pledgeRules } from './pledgeConfig.js';
import { interpolate, consentGroups, eotcStatementsSchool, eotcStatementsKindergarten } from './formDefinition.js';

const tenantId = process.env.AZURE_TENANT_ID;
const clientId = process.env.AZURE_CLIENT_ID;
const clientSecret = process.env.AZURE_CLIENT_SECRET;
const sender = process.env.EMAIL_SENDER;

const UNTICKED_PERMISSIONS = [
  ['Medical consent', 'medical', consentGroups.medical],
  ['School EOTC consent', 'eotcSchool', eotcStatementsSchool],
  ['Kindergarten / Nursery EOTC consent', 'eotcKindergarten', eotcStatementsKindergarten],
  ['Conduct consent', 'conduct', consentGroups.conduct],
  ['Photos consent', 'photos', consentGroups.photos],
];

function formatSubmittedAt(pledge) {
  const raw = pledge.receivedAt || pledge.submittedAt;
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return String(raw);
  return date.toLocaleString('en-NZ', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function buildBody(pledge) {
  const lines = [
    `Parent / guardian: ${pledge.parentName}`,
    `Email: ${pledge.email}`,
    '',
    'School children:',
  ];

  const schoolCount = Number(pledge.schoolChildCount) || 0;
  for (let i = 1; i <= schoolCount; i++) {
    const name = pledge[`school${i}Name`] || `School child ${i}`;
    const klass = pledge[`school${i}Class`];
    lines.push(
      `- ${name}${klass ? ` (${klass})` : ''}: pledge ${money(pledge[`school${i}Amount`])}, disbursement ${money(pledge[`school${i}Disbursement`])}`,
    );
  }
  if (!schoolCount) lines.push('- None');

  lines.push('', 'Kindergarten / Nursery children:');
  const kindergartenCount = Number(pledge.kindergartenChildCount) || 0;
  for (let i = 1; i <= kindergartenCount; i++) {
    const name = pledge[`kindergarten${i}Name`] || `Kindergarten child ${i}`;
    const detail = [pledge[`kindergarten${i}Age`] ? `age ${pledge[`kindergarten${i}Age`]}` : '', pledge[`kindergarten${i}Days`] ? `${pledge[`kindergarten${i}Days`]} days/week` : '']
      .filter(Boolean)
      .join(', ');
    lines.push(
      `- ${name}${detail ? ` (${detail})` : ''}: pledge ${money(pledge[`kindergarten${i}Amount`])}, disbursement ${money(pledge[`kindergarten${i}Disbursement`])}`,
    );
  }
  if (!kindergartenCount) lines.push('- None');

  if (pledge.custodyApplies === 'on') {
    lines.push(
      '',
      'Custodial arrangements: Yes — the children live across more than one household or have special custodial arrangements. See the attached PDF for details.',
    );
  } else {
    lines.push('', 'Custodial arrangements: No');
  }

  const notConsented = [];
  for (const [label, key, statements] of UNTICKED_PERMISSIONS) {
    statements.forEach((text, index) => {
      if (pledge[`${key}-${index}`] !== 'on') {
        notConsented.push(`- ${label}: ${interpolate(text, { schoolName: pledgeRules.schoolName, year: pledgeRules.year })}`);
      }
    });
  }
  lines.push('', 'Permissions not consented:', ...(notConsented.length ? notConsented : ['None — all permissions ticked']));

  lines.push('', `Total pledge: ${money(pledge.totalPledge)}`);
  if (pledge.pledgeComments) {
    lines.push(`Comments: ${pledge.pledgeComments}`);
  }
  lines.push('', `Submitted: ${formatSubmittedAt(pledge)}`);

  return lines.join('\n');
}

export async function sendPledgeNotification(pledge, pdfBuffer) {
  if (!sender) {
    throw new Error('EMAIL_SENDER is not configured');
  }
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Azure AD credentials are not configured');
  }

  const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
  const token = await credential.getToken('https://graph.microsoft.com/.default');

  const adminEmail = process.env.EMAIL_ADMIN;
  if (!adminEmail) {
    throw new Error('EMAIL_ADMIN is not configured — every pledge email must go to the school');
  }

  const message = {
    subject: `New pledge submission from ${pledge.parentName}`,
    body: {
      contentType: 'Text',
      content: buildBody(pledge),
    },
    from: {
      emailAddress: { address: sender },
    },
    toRecipients: [
      {
        emailAddress: {
          address: adminEmail,
        },
      },
    ],
    ccRecipients: [
      {
        emailAddress: {
          address: pledge.email,
        },
      },
    ],
  };

  if (pdfBuffer) {
    message.attachments = [
      {
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: `pledge-${(pledge.receivedAt || new Date().toISOString()).slice(0, 10)}.pdf`,
        contentType: 'application/pdf',
        contentBytes: pdfBuffer.toString('base64'),
      },
    ];
  }

  const response = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message, saveToSentItems: true }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Graph API error ${response.status}: ${text}`);
  }
}
