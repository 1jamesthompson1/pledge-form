import { ClientSecretCredential } from '@azure/identity';

const tenantId = process.env.AZURE_TENANT_ID;
const clientId = process.env.AZURE_CLIENT_ID;
const clientSecret = process.env.AZURE_CLIENT_SECRET;
const sender = process.env.EMAIL_SENDER;

function buildBody(pledge) {
  const lines = [
    `Parent / guardian: ${pledge.parentName}`,
    `Email: ${pledge.email}`,
    `School children: ${pledge.schoolChildCount}`,
    `Kindergarten / Nursery children: ${pledge.kindergartenChildCount}`,
    `Total pledge: ${pledge.totalPledge || 'not set'}`,
    `Submitted at: ${pledge.receivedAt || new Date().toISOString()}`,
  ];

  if (pledge.comments) {
    lines.push(`Comments: ${pledge.comments}`);
  }

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
