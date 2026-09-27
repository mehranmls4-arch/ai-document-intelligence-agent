'use client';

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/apiClient';
import { StatusBadge, Confidence } from '../components/Badges';

type UploadState = 'idle' | 'uploading' | 'done' | 'error';

export default function UploadPage() {
  const [dragActive, setDragActive] = useState(false);
  const [state, setState] = useState<UploadState>('idle');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setState('uploading');
    setError(null);
    setResult(null);
    try {
      const doc = await api.uploadDocument(file);
      setResult(doc);
      setState('done');
    } catch (e: any) {
      setError(e.message);
      setState('error');
    }
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1>Upload a document</h1>
        <p>
          PDF, PNG or JPG. The document is text-extracted (or OCR&apos;d if it&apos;s a scan),
          classified, and -- for invoices -- run through structured extraction and validation
          immediately.
        </p>
      </div>

      <div
        className={`dropzone${dragActive ? ' active' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          const file = e.dataTransfer.files?.[0];
          if (file) handleFile(file);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
      >
        <h3>Drop a document here</h3>
        <p>or click to choose a file — PDF, PNG, JPG up to 15MB</p>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </div>

      {state === 'uploading' && <p className="note" style={{ marginTop: 16 }}>Uploading and processing…</p>}
      {state === 'error' && (
        <p className="note" style={{ marginTop: 16, color: 'var(--danger)' }}>
          {error}
        </p>
      )}

      {result && (
        <div className="section" style={{ marginTop: 28 }}>
          <div className="section-title">Result</div>
          <div className="card">
            <div className="field-row">
              <div className="field-label">Filename</div>
              <div className="field-value">{result.originalFilename}</div>
            </div>
            <div className="field-row">
              <div className="field-label">Status</div>
              <div className="field-value">
                <StatusBadge status={result.status} />
              </div>
            </div>
            <div className="field-row">
              <div className="field-label">Document type</div>
              <div className="field-value">{result.documentType}</div>
            </div>
            <div className="field-row">
              <div className="field-label">Classification confidence</div>
              <div className="field-value">
                <Confidence value={result.classificationConfidence} />
              </div>
            </div>
            {result.failureReason && (
              <div className="field-row">
                <div className="field-label">Failure reason</div>
                <div className="field-value">{result.failureReason}</div>
              </div>
            )}
            <div className="btn-row" style={{ marginTop: 16 }}>
              <Link className="btn btn-primary" href={`/documents/${result.id}`}>
                View full result
              </Link>
              <button className="btn" onClick={() => inputRef.current?.click()}>
                Upload another
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
