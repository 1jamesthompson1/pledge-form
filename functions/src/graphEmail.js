import { ClientSecretCredential } from '@azure/identity';
import { money, pledgeRules } from './pledgeConfig.js';
import {
  interpolate, consentGroups, eotcStatementsSchool, eotcStatementsKindergarten, childWord, theirFacePhrase,
} from './formDefinition.js';

const tenantId = process.env.AZURE_TENANT_ID;
const clientId = process.env.AZURE_CLIENT_ID;
const clientSecret = process.env.AZURE_CLIENT_SECRET;
const sender = process.env.EMAIL_SENDER;

const UNTICKED_PERMISSIONS = [
  ['Medical consent', 'medical', consentGroups.medical],
  ['School EOTC consent', 'eotcSchool', eotcStatementsSchool],
  ['Kindergarten / Nursery EOTC consent', 'eotcKindergartenConsent', eotcStatementsKindergarten, true],
  ['Conduct consent', 'conduct', consentGroups.conduct],
  ['Photos consent', 'photos', consentGroups.photos],
];

function familyPronoun(familyType) {
  if (familyType === 'together') return { pronoun: 'We', pronounLower: 'we', possessive: 'our', objectPronoun: 'us', beVerb: 'are' };
  if (familyType === 'split') return { pronoun: 'I', pronounLower: 'I', possessive: 'my', objectPronoun: 'me', beVerb: 'am' };
  return { pronoun: 'I/We', pronounLower: 'we', possessive: 'our', objectPronoun: 'us', beVerb: 'are' };
}

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
    timeZone: 'Pacific/Auckland',
  });
}

function buildBody(pledge, warnings = []) {
  const lines = [
    ...(warnings.length ? [...warnings, ''] : []),
    `Parent / guardian: ${pledge.parentName}`,
    `Email: ${pledge.email}`,
    ...(pledge.otherParentEmail ? [`Other parent / guardian email: ${pledge.otherParentEmail}`] : []),
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

  const familyTypeLabel = pledge.familyType === 'together'
    ? 'Both parents / guardians are pledging together'
    : pledge.familyType === 'split'
      ? 'Parents / guardians are pledging separately'
      : 'Not specified';
  lines.push('', `Parents / guardians: ${familyTypeLabel}`);

  const notConsented = [];
  const pronounVars = familyPronoun(pledge.familyType);
  const interpolateVars = {
    schoolName: pledgeRules.schoolName,
    year: pledgeRules.year,
    child: childWord(schoolCount + kindergartenCount),
    theirFace: theirFacePhrase(schoolCount + kindergartenCount),
    ...pronounVars,
  };
  for (const [label, key, statements, single] of UNTICKED_PERMISSIONS) {
    if (single) {
      if (pledge[key] !== 'on') {
        statements.forEach((text) => notConsented.push(`- ${label}: ${interpolate(text, interpolateVars)}`));
      }
      continue;
    }
    statements.forEach((text, index) => {
      if (pledge[`${key}-${index}`] !== 'on') {
        notConsented.push(`- ${label}: ${interpolate(text, interpolateVars)}`);
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

async function getGraphToken() {
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Azure AD credentials are not configured');
  }
  const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
  return credential.getToken('https://graph.microsoft.com/.default');
}

async function sendMail(message) {
  if (!sender) {
    throw new Error('EMAIL_SENDER is not configured');
  }
  const token = await getGraphToken();
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

export async function sendPledgeNotification(pledge, pdfBuffer, versionInfo = {}) {
  const adminEmail = process.env.EMAIL_ADMIN;
  const devEmail = process.env.EMAIL_DEV;
  const isDev = pledge.dev === true;
  const recipient = isDev && devEmail ? devEmail : adminEmail;
  if (!recipient) {
    throw new Error('EMAIL_ADMIN is not configured (set EMAIL_DEV to route test submissions separately)');
  }

  const { formVersion, backendFormVersion, mismatch } = versionInfo;
  const warnings = mismatch
    ? [
        '*** VERSION MISMATCH WARNING ***',
        `The submitted form version (${formVersion || 'unknown'}) does not match the backend version (${backendFormVersion || 'unknown'}).`,
        'The attached PDF is generated by the backend from its own copy of the form and may not exactly match the live form the parent / guardian completed.',
      ]
    : [];

  const replyTo = String(pledge.email || '').trim();
  const message = {
    subject: `${isDev ? '[TEST] ' : ''}${mismatch ? '[VERSION MISMATCH] ' : ''}New pledge submission from ${pledge.parentName}`,
    body: {
      contentType: 'Text',
      content: buildBody(pledge, warnings),
    },
    from: {
      emailAddress: { address: sender },
    },
    toRecipients: [
      {
        emailAddress: {
          address: recipient,
        },
      },
    ],
    // Replies from the office go straight back to the parent / guardian.
    ...(replyTo ? { replyTo: [{ emailAddress: { address: replyTo } }] } : {}),
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

  await sendMail(message);
}

export async function sendParentConfirmation(pledge) {
  const isDev = pledge.dev === true;
  const recipientEmails = [String(pledge.email || '').trim(), String(pledge.otherParentEmail || '').trim()];
  const parentEmails = [...new Set(recipientEmails.filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))];
  if (!parentEmails.length) {
    throw new Error('No parent/guardian email address on the submission');
  }

  const schoolCount = Number(pledge.schoolChildCount) || 0;
  const kindergartenCount = Number(pledge.kindergartenChildCount) || 0;
  const children = [
    ...Array.from({ length: schoolCount }, (_, i) => pledge[`school${i + 1}Name`] || `School child ${i + 1}`),
    ...Array.from({ length: kindergartenCount }, (_, i) => pledge[`kindergarten${i + 1}Name`] || `Kindergarten child ${i + 1}`),
  ];
  const childList = children.length
    ? children.map((name) => `  - ${name}`).join('\n')
    : '  - (no children listed)';

  const content = [
    `Kia ora ${pledge.parentName || 'whānau'},`,
    '',
    `Thank you. We have received your ${pledgeRules.year} Special Character Pledge Form for ${pledgeRules.schoolName}.`,
    '',
    'Children included on this pledge:',
    childList,
    '',
    'This is an automated confirmation that your pledge was received. The school office will be in touch if anything needs clarification.',
    '',
    pledgeRules.schoolName,
  ].join('\n');

  const message = {
    subject: `${isDev ? '[TEST] ' : ''}We have received your ${pledgeRules.year} pledge`,
    body: {
      contentType: 'Text',
      content,
    },
    from: {
      emailAddress: { address: sender },
    },
    toRecipients: parentEmails.map((address) => ({
      emailAddress: { address },
    })),
  };

  const replyToAddress = process.env.EMAIL_ADMIN;
  if (replyToAddress) {
    message.replyTo = [{ emailAddress: { address: replyToAddress } }];
  }

  await sendMail(message);
}
