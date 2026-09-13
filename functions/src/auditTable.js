import { TableClient } from '@azure/data-tables';

let tableClient;
let tableReady = false;

function getTableClient() {
  if (tableClient) return tableClient;

  const connectionString =
    process.env.AZURE_STORAGE_CONNECTION_STRING || process.env.AzureWebJobsStorage;
  if (!connectionString) {
    throw new Error('Storage connection string is not configured');
  }
  const tableName = process.env.SUBMISSIONS_TABLE || 'pledgeaudit';

  tableClient = TableClient.fromConnectionString(connectionString, tableName);
  return tableClient;
}

async function ensureTable() {
  if (tableReady) return;
  const client = getTableClient();
  try {
    await client.createTable();
  } catch (error) {
    if (!/already exists|TableAlreadyExists/i.test(String(error?.message || error))) throw error;
  }
  tableReady = true;
}

export function partitionKeyFor(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export async function createAuditEntry({ submissionId, blobName, partitionKey, parentName, receivedAt }) {
  await ensureTable();
  const entity = {
    partitionKey,
    rowKey: submissionId,
    BlobName: blobName,
    ParentName: parentName || '',
    SubmittedAt: receivedAt || new Date().toISOString(),
    Status: 'received',
    EmailSent: '',
    ParentEmailSent: '',
    EmailError: '',
    Errors: '',
  };
  await getTableClient().createEntity(entity);
}

export async function updateAuditEntry({ submissionId, partitionKey, fields }) {
  await ensureTable();
  const client = getTableClient();
  const entity = await client.getEntity(partitionKey, submissionId);
  Object.assign(entity, fields);
  await client.updateEntity(entity, 'Replace');
}

// Deletes every audit entry whose partition key (the submission date,
// YYYY-MM-DD) sorts before cutoffDate. Partition keys are date strings, so a
// lexical "lt" comparison is a date comparison. Returns the number deleted.
export async function deleteAuditEntriesBefore(cutoffDate) {
  await ensureTable();
  const client = getTableClient();
  const entities = client.listEntities({ queryOptions: { filter: `PartitionKey lt '${cutoffDate}'` } });
  let deleted = 0;
  for await (const entity of entities) {
    await client.deleteEntity(entity.partitionKey, entity.rowKey);
    deleted += 1;
  }
  return deleted;
}
