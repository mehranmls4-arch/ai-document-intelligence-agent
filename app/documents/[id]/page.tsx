'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/apiClient';
import { StatusBadge, ValidationBadge, Confidence } from '../../components/Badges';

const INVOICE_FIELDS: Array<{ key: string; label: string; numeric?: boolean }> = [
  { key: 'vendorName', label: 'Vendor' },
  { key: 'vendorAddress', label: 'Vendor address' },
  { key: 'invoiceNumber', label: 'Invoice #' },
  { key: 'invoiceDate', label: 'Invoice date' },
  { key: 'dueDate', label: 'Due date' },
  { key: 'currency', label: 'Currency' },
  { key: 'purchaseOrderNumber', label: 'PO number' },
  { key: 'subtotal', label: 'Subtotal', numeric: true },
  { key: 'tax', label: 'Tax', numeric: true },
  { key: 'discount', label: 'Discount', numeric: true },
  { key: 'total', label: 'Total', numeric: true },
  { key: 'paymentTerms', label: 'Payment terms' },
];

export default function DocumentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [doc, setDoc] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [showRawText, setShowRawText] = useState(false);

  const load = () => api.getDocument(id).then(setDoc).catch((e) => setError(e.message));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (error) return <p className="note">{error}</p>;
  if (!doc) return <p className="note">Loading…</p>;

  const invoice = doc.invoice;
  const fieldConfidence = invoice?.fieldConfidenceJson ? JSON.parse(invoice.fieldConfidenceJson) : {};

  const startEdit = () => {
    const initial: Record<string, string> = {};
    for (const f of INVOICE_FIELDS) {
      const v = invoice?.[f.key];
      initial[f.key] = v === null || v === undefined ? '' : String(v);
    }
    setDraft(initial);
    setEditing(true);
  };

  const saveEdit = async () => {
    setBusy(true);
    try {
      const fields: Record<string, string | number | null> = {};
      for (const f of INVOICE_FIELDS) {
        const raw = draft[f.key];
        fields[f.key] = raw === '' ? null : f.numeric ? Number(raw) : raw;
      }
      await api.updateFields(id, fields);
      setEditing(false);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const doReview = async (action: 'APPROVE' | 'REJECT' | 'SEND_BACK') => {
    setBusy(true);
    try {
      await api.review(id, action);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const reprocess = async () => {
    setBusy(true);
    try {
      await api.reprocess(id);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const analysis = doc.aiAnalysis
    ? { ...doc.aiAnalysis, keyObservations: JSON.parse(doc.aiAnalysis.keyObservationsJson), anomalies: JSON.parse(doc.aiAnalysis.anomaliesJson) }
    : null;

  return (
    <div>
      <div className="page-header">
        <h1>{doc.originalFilename}</h1>
        <div className="btn-row" style={{ marginTop: 10, alignItems: 'center' }}>
          <StatusBadge status={doc.status} />
          <span className="note">{doc.documentType.toLowerCase().replace('_', ' ')}</span>
          <Confidence value={doc.overallConfidence} />
        </div>
      </div>

      <div className="btn-row" style={{ marginBottom: 24 }}>
        <a className="btn" href={api.exportUrl(id, 'json')}>Export JSON</a>
        <a className="btn" href={api.exportUrl(id, 'csv')}>Export CSV</a>
        <button className="btn" onClick={reprocess} disabled={busy}>Reprocess</button>
      </div>

      {doc.failureReason && (
        <div className="card" style={{ marginBottom: 24, borderColor: 'var(--danger)' }}>
          <strong style={{ color: 'var(--danger)' }}>Failed:</strong> {doc.failureReason}
        </div>
      )}

      <div className="split">
        <div className="section">
          <div className="section-title">Original document</div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {doc.fileType === 'application/pdf' ? (
              <iframe src={`/api/documents/${id}/file`} title="Original document" width="100%" height="480" style={{ border: 'none' }} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/documents/${id}/file`} alt="Original document" style={{ width: '100%', display: 'block' }} />
            )}
          </div>
          <button className="btn" style={{ marginTop: 10 }} onClick={() => setShowRawText((v) => !v)}>
            {showRawText ? 'Hide' : 'Show'} extracted text
          </button>
          {showRawText && <pre className="text-extract" style={{ marginTop: 10 }}>{doc.extractedText || '(no text extracted)'}</pre>}
        </div>

        <div className="section">
          <div className="section-title">Extracted invoice data</div>
          {!invoice ? (
            <div className="empty-state">No structured invoice data (document type is not "invoice", or extraction failed).</div>
          ) : (
            <div className="card">
              {INVOICE_FIELDS.map((f) => (
                <div className="field-row" key={f.key}>
                  <div className="field-label">
                    {f.label}
                    {fieldConfidence[f.key] !== undefined && (
                      <div style={{ marginTop: 2 }}>
                        <Confidence value={fieldConfidence[f.key]} />
                      </div>
                    )}
                  </div>
                  <div className="field-value">
                    {editing ? (
                      <input
                        value={draft[f.key] ?? ''}
                        onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                      />
                    ) : (
                      formatFieldValue(invoice[f.key], f.numeric, invoice.currency)
                    )}
                  </div>
                </div>
              ))}

              <div className="btn-row" style={{ marginTop: 16 }}>
                {editing ? (
                  <>
                    <button className="btn btn-primary" onClick={saveEdit} disabled={busy}>Save corrections</button>
                    <button className="btn" onClick={() => setEditing(false)} disabled={busy}>Cancel</button>
                  </>
                ) : (
                  <button className="btn" onClick={startEdit}>Edit fields</button>
                )}
              </div>

              {invoice.lineItems?.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <div className="section-title">Line items</div>
                  <table className="data-table">
                    <thead>
                      <tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr>
                    </thead>
                    <tbody>
                      {invoice.lineItems.map((li: any) => (
                        <tr key={li.id}>
                          <td>{li.description}</td>
                          <td className="mono">{li.quantity}</td>
                          <td className="mono">{li.unitPrice.toFixed(2)}</td>
                          <td className="mono">{li.amount.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="section">
        <div className="section-title">Validation</div>
        {doc.validationResults?.length > 0 ? (
          <table className="data-table">
            <thead><tr><th>Rule</th><th>Status</th><th>Message</th></tr></thead>
            <tbody>
              {doc.validationResults.map((v: any) => (
                <tr key={v.id}>
                  <td className="mono">{v.rule}</td>
                  <td><ValidationBadge status={v.status} /></td>
                  <td>{v.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">No validation has run yet.</div>
        )}
      </div>

      {analysis && (
        <div className="section">
          <div className="section-title">
            AI analysis <span className="ai-tag">{analysis.provider} / {analysis.model}</span>
          </div>
          <div className="card">
            <p>{analysis.summary}</p>
            {analysis.keyObservations.length > 0 && (
              <>
                <div className="field-label" style={{ marginTop: 12, marginBottom: 6 }}>Key observations</div>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {analysis.keyObservations.map((o: string, i: number) => <li key={i}>{o}</li>)}
                </ul>
              </>
            )}
            {analysis.anomalies.length > 0 && (
              <>
                <div className="field-label" style={{ marginTop: 12, marginBottom: 6 }}>Anomalies</div>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {analysis.anomalies.map((a: any, i: number) => (
                    <li key={i}>
                      {a.message}{' '}
                      <span className="ai-tag">{a.isFactual ? 'verified from data' : 'AI interpretation'}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}

      {doc.status === 'NEEDS_REVIEW' && (
        <div className="section">
          <div className="section-title">Human review</div>
          <div className="card">
            <p className="note">This document fell below the confidence/validation threshold and needs a decision.</p>
            <div className="btn-row" style={{ marginTop: 12 }}>
              <button className="btn btn-approve" onClick={() => doReview('APPROVE')} disabled={busy}>Approve</button>
              <button className="btn btn-reject" onClick={() => doReview('REJECT')} disabled={busy}>Reject</button>
              <button className="btn" onClick={() => doReview('SEND_BACK')} disabled={busy}>Send back for processing</button>
            </div>
          </div>
        </div>
      )}

      {doc.reviewActions?.length > 0 && (
        <div className="section">
          <div className="section-title">Audit history</div>
          <table className="data-table">
            <thead><tr><th>When</th><th>Action</th><th>Field</th><th>Original</th><th>Corrected</th><th>Reviewer</th></tr></thead>
            <tbody>
              {doc.reviewActions.map((r: any) => (
                <tr key={r.id}>
                  <td className="mono">{new Date(r.createdAt).toLocaleString()}</td>
                  <td>{r.action.toLowerCase().replace('_', ' ')}</td>
                  <td className="mono">{r.fieldName ?? '—'}</td>
                  <td className="mono">{r.originalValue ?? '—'}</td>
                  <td className="mono">{r.correctedValue ?? '—'}</td>
                  <td>{r.reviewer}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {doc.processingRuns?.length > 0 && (
        <div className="section">
          <div className="section-title">Processing log</div>
          <div className="card">
            <div className="pipeline">
              {doc.processingRuns.map((run: any) => (
                <div className="pipeline-stage" key={run.id}>
                  <span className={`pipeline-dot ${run.status.toLowerCase()}`} />
                  <span>{run.stage.toLowerCase().replace('_', ' ')}{run.errorMessage ? ` — ${run.errorMessage}` : ''}</span>
                  <span className="pipeline-duration">{run.durationMs !== null ? `${run.durationMs}ms` : ''}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatFieldValue(value: unknown, numeric?: boolean, currency?: string | null): string {
  if (value === null || value === undefined || value === '') return '—';
  if (numeric && typeof value === 'number') {
    return currency ? `${currency} ${value.toFixed(2)}` : value.toFixed(2);
  }
  return String(value);
}
