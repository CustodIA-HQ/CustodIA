import { Client, TopicMessageSubmitTransaction } from "@hiero-ledger/sdk";

let client: Client | null = null;
function getClient(): Client {
  if (client) return client;
  const operatorId = process.env.HEDERA_CLIENT_ID;
  const operatorKey = process.env.HEDERA_CLIENT_KEY;
  if (!operatorId || !operatorKey) {
    throw new Error("Missing HEDERA_CLIENT_ID or HEDERA_CLIENT_KEY");
  }
  // Initialize and set operator
  client = Client.forTestnet().setOperator(operatorId, operatorKey);
  return client;
}

/**
 * Submits an audit log to Hedera HCS.
 * Pure, linear implementation without custom fees or submitKey to minimize costs.
 */
export async function submitAuditLog(taskId: string, payload: unknown) {
  const topicId = process.env.HEDERA_TOPIC_ID;
  if (!topicId) throw new Error("Missing HEDERA_TOPIC_ID");

  const message = JSON.stringify({ taskId, timestamp: new Date().toISOString(), payload });
  
  const tx = new TopicMessageSubmitTransaction()
    .setTopicId(topicId)
    .setMessage(message);
    
  const resp = await tx.execute(getClient());
  const receipt = await resp.getReceipt(getClient());
  
  return {
    status: receipt.status.toString(),
    sequenceNumber: receipt.topicSequenceNumber?.toString(),
    txId: resp.transactionId.toString()
  };
}

/**
 * Job Handler wrapper for the new runtime.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const hcsAuditHandler = async ({ job, heartbeat }: { job: any; heartbeat: () => Promise<void> }) => {
  await heartbeat();
  const { taskId, payload } = job.payload;
  if (!taskId) throw new Error("Missing taskId in payload");
  await submitAuditLog(taskId, payload);
};
