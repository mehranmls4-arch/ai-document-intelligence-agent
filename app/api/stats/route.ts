import { eq, count, desc, sql } from 'drizzle-orm';
import { db, sqlite } from '@/lib/db/client';
import { documents } from '@/lib/db/schema';
import { ok, fail } from '@/lib/apiHelpers';

// Without this, Next.js statically pre-renders this route at build time
// (it takes no request params, so nothing else marks it dynamic) and every
// dashboard load would show build-time-frozen stats instead of live data.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [[totalRow], [completedRow], [needsReviewRow], [failedRow], recent] = await Promise.all([
      db.select({ value: count() }).from(documents),
      db.select({ value: count() }).from(documents).where(eq(documents.status, 'COMPLETED')),
      db.select({ value: count() }).from(documents).where(eq(documents.status, 'NEEDS_REVIEW')),
      db.select({ value: count() }).from(documents).where(eq(documents.status, 'FAILED')),
      db.query.documents.findMany({
        orderBy: [desc(documents.createdAt)],
        limit: 8,
        with: { invoice: true },
      }),
    ]);

    // Average wall-clock time per document: earliest processing_run start to
    // latest processing_run completion, for documents with at least one
    // completed stage. Plain SQL is simplest here -- this is a single
    // read-only aggregate query, not part of the application's write path.
    const avgRow = sqlite
      .prepare(
        `SELECT AVG(duration) AS avg_duration FROM (
           SELECT (MAX(completed_at) - MIN(started_at)) AS duration
           FROM processing_runs
           WHERE completed_at IS NOT NULL
           GROUP BY document_id
         )`
      )
      .get() as { avg_duration: number | null };

    return ok({
      totalDocuments: totalRow?.value ?? 0,
      completed: completedRow?.value ?? 0,
      needsReview: needsReviewRow?.value ?? 0,
      failed: failedRow?.value ?? 0,
      avgProcessingTimeMs: avgRow?.avg_duration ?? null,
      recentDocuments: recent,
    });
  } catch (err: any) {
    return fail(`Failed to load stats: ${err.message}`, 500, 'STATS_FAILED');
  }
}
