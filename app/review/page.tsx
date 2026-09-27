'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/apiClient';
import { Confidence, ValidationBadge } from '../components/Badges';

export default function ReviewQueuePage() {
  const [documents, setDocuments] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () =>
    api
      .getReviewQueue()
      .then((d) => setDocuments(d.documents))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1>Review queue</h1>
        <p>
          Documents below the confidence threshold, or that failed a validation rule, waiting on a
          human decision.
        </p>
      </div>

      {error && <p className="note">{error}</p>}
      {!loading && documents.length === 0 && (
        <div className="empty-state">Nothing needs review right now.</div>
      )}

      {documents.map((doc) => (
        <div className="card" key={doc.id} style={{ marginBottom: 14 }}>
          <div className="btn-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <Link className="row-link" href={`/documents/${doc.id}`} style={{ fontSize: 16, fontWeight: 500 }}>
                {doc.originalFilename}
              </Link>
              <div className="note" style={{ marginTop: 4 }}>
                {doc.invoice?.vendorName ?? 'Unknown vendor'} · {doc.invoice?.invoiceNumber ?? 'no invoice #'}
              </div>
            </div>
            <Confidence value={doc.overallConfidence} />
          </div>
          {doc.validationResults?.length > 0 && (
            <div className="btn-row" style={{ marginTop: 12 }}>
              {doc.validationResults.map((v: any) => (
                <ValidationBadge key={v.id} status={v.status} />
              ))}
            </div>
          )}
          <div className="btn-row" style={{ marginTop: 14 }}>
            <Link className="btn btn-primary" href={`/documents/${doc.id}`}>
              Open and review
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}
