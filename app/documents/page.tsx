'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/apiClient';
import { StatusBadge, Confidence } from '../components/Badges';

const STATUS_FILTERS = ['ALL', 'UPLOADED', 'NEEDS_REVIEW', 'COMPLETED', 'FAILED'];

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api
      .listDocuments(statusFilter === 'ALL' ? {} : { status: statusFilter })
      .then((data) => {
        setDocuments(data.documents);
        setTotal(data.total);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  return (
    <div>
      <div className="page-header">
        <h1>Documents</h1>
        <p>Every document that has been uploaded, with its current pipeline status.</p>
      </div>

      <div className="btn-row" style={{ marginBottom: 20 }}>
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            className={`btn${statusFilter === s ? ' btn-primary' : ''}`}
            onClick={() => setStatusFilter(s)}
          >
            {s === 'ALL' ? 'All' : s.replace('_', ' ').toLowerCase()}
          </button>
        ))}
      </div>

      {error && <p className="note">{error}</p>}
      {!loading && documents.length === 0 && (
        <div className="empty-state">
          No documents match this filter. <Link href="/upload">Upload one</Link>.
        </div>
      )}

      {documents.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Document</th>
              <th>Type</th>
              <th>Vendor</th>
              <th>Total</th>
              <th>Status</th>
              <th>Confidence</th>
              <th>Uploaded</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => (
              <tr key={doc.id}>
                <td>
                  <Link className="row-link" href={`/documents/${doc.id}`}>
                    {doc.originalFilename}
                  </Link>
                </td>
                <td>{doc.documentType.toLowerCase().replace('_', ' ')}</td>
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
                <td className="mono">{new Date(doc.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {total > documents.length && (
        <p className="note" style={{ marginTop: 12 }}>
          Showing {documents.length} of {total}.
        </p>
      )}
    </div>
  );
}
