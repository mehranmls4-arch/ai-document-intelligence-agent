// Thin fetch wrapper used only by client components. Deliberately has no
// imports from server-only modules (fs, child_process, prisma) so it is
// safe to bundle for the browser.

export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: { message: string; code: string | null };
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json: ApiEnvelope<T> = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.error?.message || `Request to ${url} failed with status ${res.status}`);
  }
  return json.data as T;
}

export const api = {
  uploadDocument: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return request<any>('/api/documents/upload', { method: 'POST', body: formData });
  },
  listDocuments: (params: { status?: string; documentType?: string } = {}) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return request<{ documents: any[]; total: number }>(`/api/documents${qs ? `?${qs}` : ''}`);
  },
  getDocument: (id: string) => request<any>(`/api/documents/${id}`),
  getStatus: (id: string) => request<any>(`/api/documents/${id}/status`),
  getResult: (id: string) => request<any>(`/api/documents/${id}/result`),
  getValidation: (id: string) => request<any>(`/api/documents/${id}/validation`),
  reprocess: (id: string) => request<any>(`/api/documents/${id}/process`, { method: 'POST' }),
  review: (id: string, action: 'APPROVE' | 'REJECT' | 'SEND_BACK', notes?: string) =>
    request<any>(`/api/documents/${id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, notes }),
    }),
  updateFields: (id: string, fields: Record<string, string | number | null>) =>
    request<any>(`/api/documents/${id}/fields`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    }),
  getReviewQueue: () => request<{ documents: any[]; total: number }>('/api/review-queue'),
  getStats: () => request<any>('/api/stats'),
  exportUrl: (id: string, format: 'json' | 'csv') => `/api/documents/${id}/export?format=${format}`,
};
