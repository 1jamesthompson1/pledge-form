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
          address: pledge.email,
        },
      },
    ],
    saveToSentItems: 'true',
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

  const adminEmail = process.env.EMAIL_ADMIN;
  if (adminEmail) {
    message.ccRecipients = [
      {
        emailAddress: {
          address: adminEmail,
        },
      },
    ];
  }

  const response = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Graph API error ${response.status}: ${text}`);
  }
}
