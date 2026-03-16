import { processAllUsersDailyImport } from "./jvzoo.js";

export interface CronJobResult {
  jobName: string;
  executedAt: Date;
  success: boolean;
  result?: any;
  error?: string;
}

export async function runDailyJvzooImport(): Promise<CronJobResult> {
  const executedAt = new Date();
  
  try {
    console.log(`[CRON] Starting daily JVZoo import at ${executedAt.toISOString()}`);
    
    const result = await processAllUsersDailyImport();
    
    console.log(`[CRON] JVZoo import completed: ${result.successCount} successful, ${result.failureCount} failed`);
    console.log(`[CRON] Transactions: ${result.totalImported} imported, ${result.totalSkipped} skipped`);
    
    return {
      jobName: "daily-jvzoo-import",
      executedAt,
      success: true,
      result,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[CRON] JVZoo import failed:`, errorMessage);
    
    return {
      jobName: "daily-jvzoo-import",
      executedAt,
      success: false,
      error: "JVZoo import failed",
    };
  }
}

// Export for manual triggering
export const cronJobs = {
  "daily-jvzoo-import": runDailyJvzooImport,
};

// If run directly from CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const jobName = process.argv[2];
  
  if (jobName && jobName in cronJobs) {
    const job = cronJobs[jobName as keyof typeof cronJobs];
    job().then(result => {
      console.log("[CRON] Job completed:", JSON.stringify(result, null, 2));
      process.exit(0);
    }).catch(error => {
      console.error("[CRON] Job failed:", error);
      process.exit(1);
    });
  } else {
    console.log("Available cron jobs:", Object.keys(cronJobs).join(", "));
    console.log("Usage: node dist/services/cron.js <job-name>");
    process.exit(1);
  }
}
