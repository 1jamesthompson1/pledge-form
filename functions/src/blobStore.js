import { BlobServiceClient } from '@azure/storage-blob';
import { randomUUID } from 'node:crypto';

let containerClient;

function getContainerClient() {
  if (containerClient) return containerClient;

  const connectionString =
    process.env.AZURE_STORAGE_CONNECTION_STRING || process.env.AzureWebJobsStorage;
  if (!connectionString) {
    throw new Error('Storage connection string is not configured');
  }
  const containerName = process.env.SUBMISSIONS_CONTAINER || 'pledge-submissions';

  const client = BlobServiceClient.fromConnectionString(connectionString);
  containerClient = client.getContainerClient(containerName);
  return containerClient;
}

export function newSubmissionId() {
  return randomUUID();
}

export async function persistSubmission(rawBody, meta, submissionId = newSubmissionId()) {
  const container = getContainerClient();
  await container.createIfNotExists();

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const blobName = `pledge-${timestamp}-${submissionId}.json`;

  const blob = container.getBlockBlobClient(blobName);
  await blob.upload(rawBody, rawBody.length, {
    metadata: {
      receivedAt: new Date().toISOString(),
      ...(meta?.ip ? { ip: meta.ip } : {}),
      ...(meta?.origin ? { origin: meta.origin } : {}),
      ...(meta?.spam ? { spam: 'true' } : {}),
    },
  });
  return blobName;
}
