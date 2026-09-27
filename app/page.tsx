'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/apiClient';
import { StatusBadge, Confidence } from './components/Badges';

export default function DashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getStats().then(setStats).catch((e) => setError(e.message));
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>
          A running view of every document moving through extraction, classification, validation
          and review.
        </p>
      </div>

      {error && <p className="note">Could not load stats: {error}</p>}

      {stats && (
        <>
          <div className="stat-row">
            <div className="stat">
              <div className="value mono">{stats.totalDocuments}</div>
              <div className="label">Total documents</div>
            </div>
            <div className="stat">
              <div className="value mono">{stats.completed}</div>
              <div className="label">Completed</div>
            </div>
            <div className="stat">
              <div className="value mono">{stats.needsReview}</div>
              <div className="label">Needs review</div>
            </div>
            <div className="stat">
              <div className="value mono">{stats.failed}</div>
              <div className="label">Failed</div>
            </div>
          </div>

          <div className="section">
            <div className="section-title">
              Average processing time
              {stats.avgProcessingTimeMs !== null && (
                <span className="mono" style={{ marginLeft: 10, color: 'var(--ink)' }}>
                  {(stats.avgProcessingTimeMs / 1000).toFixed(2)}s / document
                </span>
              )}
            </div>
          </div>

          <div className="section">
            <div className="section-title">Recent documents</div>
            {stats.recentDocuments.length === 0 ? (
              <div className="empty-state">
                No documents yet. <Link href="/upload">Upload one</Link> to see the pipeline run.
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Vendor</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th>Confidence</th>
                    <th>Uploaded</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentDocuments.map((doc: any) => (
                    <tr key={doc.id}>
                      <td>
                        <Link className="row-link" href={`/documents/${doc.id}`}>
                          {doc.originalFilename}
                        </Link>
                      </td>
                      <td>{doc.invoice?.vendorName ?? '—'}</td>
                      <td className="mono">
                        {doc.invoice?.total !== undefined && doc.invoice?.total !== null
                          ? `${doc.invoice.currency ?? ''} ${doc.invoice.total.toFixed(2)}`
                          : '—'}
                      </td>
                      <td>
                        <StatusBadge status={doc.status} />
                      </td>
                      <td>
                        <Confidence value={doc.overallConfidence} />
                      </td>
                      <td className="mono">{new Date(doc.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
