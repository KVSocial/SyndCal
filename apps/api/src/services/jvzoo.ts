import { prisma } from "../lib/db.js";
import { createDecipheriv, createCipheriv, randomBytes } from "node:crypto";

interface JvzooTransaction {
  transaction_id: string;
  date: string;
  product_name: string;
  product_id: number;
  status: string;
  price: string;
  customer_email: string;
  affiliate_commission: string;
  affiliate_id: number;
  affiliate_name: string;
}

interface JvzooResponse {
  meta: {
    status: {
      http_status_code: number;
    };
    results_count: number;
  };
  results: JvzooTransaction[];
}

const JVZOO_BASE_URL = "https://api.jvzoo.com/v2.0";

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  apiKey: string,
  retries = 3,
  backoffMs = 1000
): Promise<JvzooResponse> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Authorization": `Basic ${Buffer.from(`${apiKey}:x`).toString("base64")}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`JVZoo API error: ${response.status} ${response.statusText}`);
      }

      const data: JvzooResponse = await response.json();
      
      if (data.meta.status.http_status_code !== 200) {
        throw new Error(`JVZoo API returned status ${data.meta.status.http_status_code}`);
      }

      return data;
    } catch (error) {
      if (attempt === retries) {
        throw error;
      }
      const waitTime = backoffMs * Math.pow(2, attempt - 1);
      console.log(`JVZoo API retry ${attempt}/${retries} after ${waitTime}ms:`, error);
      await delay(waitTime);
    }
  }
  throw new Error("JVZoo API retry exhausted");
}

export async function verifyJvzooApiKey(apiKey: string): Promise<{ success: boolean; error?: string }> {
  try {
    const url = `${JVZOO_BASE_URL}/latest-affiliates-transactions/`;
    await fetchWithRetry(url, apiKey, 3, 1000);
    
    // Successfully fetched, even if empty results
    return { success: true };
  } catch (error) {
    console.error("JVZoo API verification failed", error);
    return { 
      success: false, 
      error: "Verification failed" 
    };
  }
}

export async function fetchJvzooTransactions(
  apiKey: string,
  paykey?: string
): Promise<JvzooTransaction[]> {
  const url = paykey 
    ? `${JVZOO_BASE_URL}/latest-affiliates-transactions/${encodeURIComponent(paykey)}`
    : `${JVZOO_BASE_URL}/latest-affiliates-transactions/`;
  
  const data = await fetchWithRetry(url, apiKey, 3, 1000);
  return data.results;
}

export async function importTransactionsForUser(
  userId: string,
  apiKey: string,
  targetDate?: Date
): Promise<{ imported: number; skipped: number }> {
  let imported = 0;
  let skipped = 0;
  let lastPaykey: string | undefined;
  let hasMore = true;
  let iterations = 0;
  const maxIterations = 100; // Safety limit

  // If targetDate is provided, we'll fetch until we pass it
  const targetTime = targetDate?.getTime() || Date.now() - (24 * 60 * 60 * 1000); // Default to yesterday

  while (hasMore && iterations < maxIterations) {
    iterations++;
    
    try {
      const transactions = await fetchJvzooTransactions(apiKey, lastPaykey);
      
      if (transactions.length === 0) {
        hasMore = false;
        break;
      }

      for (const tx of transactions) {
        const txDate = new Date(tx.date).getTime();
        
        // If we've gone past our target date range, stop
        if (targetDate && txDate < targetTime - (24 * 60 * 60 * 1000)) {
          hasMore = false;
          break;
        }

        // Check if transaction already exists
        const existing = await prisma.affiliateTransaction.findUnique({
          where: { transactionId: tx.transaction_id },
        });

        if (existing) {
          skipped++;
        } else {
          await prisma.affiliateTransaction.create({
            data: {
              transactionId: tx.transaction_id,
              userId,
              date: new Date(tx.date),
              productName: tx.product_name,
              productId: tx.product_id,
              status: tx.status,
              price: parseFloat(tx.price),
              affiliateCommission: parseFloat(tx.affiliate_commission),
              rawResponse: tx as any,
            },
          });
          imported++;
        }

        lastPaykey = tx.transaction_id;
      }

      // Check if we got fewer than 100 results (means no more pages)
      if (transactions.length < 100) {
        hasMore = false;
      }

      // Rate limiting: 500ms delay between API calls
      if (hasMore) {
        await delay(500);
      }
    } catch (error) {
      console.error(`Error fetching JVZoo transactions for user ${userId}:`, error);
      throw error;
    }
  }

  return { imported, skipped };
}

export async function processAllUsersDailyImport(): Promise<{ 
  successCount: number; 
  failureCount: number;
  totalImported: number;
  totalSkipped: number;
}> {
  const credentials = await prisma.jvzooCredential.findMany({
    where: {
      verifiedAt: { not: null },
    },
    include: {
      user: true,
    },
  });

  let successCount = 0;
  let failureCount = 0;
  let totalImported = 0;
  let totalSkipped = 0;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  for (const cred of credentials) {
    try {
      const apiKey = decryptApiKey(cred.encryptedApiKey);
      
      const result = await importTransactionsForUser(cred.userId, apiKey, yesterday);
      
      totalImported += result.imported;
      totalSkipped += result.skipped;
      successCount++;

      console.log(`JVZoo import for user ${cred.userId}: ${result.imported} imported, ${result.skipped} skipped`);

      // Rate limiting between users
      await delay(500);
    } catch (error) {
      failureCount++;
      console.error(`JVZoo import failed for user ${cred.userId}:`, error);
    }
  }

  return { successCount, failureCount, totalImported, totalSkipped };
}

function getEncryptionKey(): Buffer {
  const key = process.env.JVZOO_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("JVZOO_ENCRYPTION_KEY is required");
  }
  if (key.length !== 64) {
    throw new Error("JVZOO_ENCRYPTION_KEY must be 64 hex characters");
  }
  return Buffer.from(key, "hex");
}

function encryptApiKey(apiKey: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${ciphertext.toString("hex")}`;
}

function decryptApiKey(encrypted: string): string {
  const [ivHex, tagHex, dataHex] = encrypted.split(":");
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error("Invalid encrypted API key format");
  }
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const data = Buffer.from(dataHex, "hex");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
  return plaintext.toString("utf8");
}

export { encryptApiKey, decryptApiKey };
