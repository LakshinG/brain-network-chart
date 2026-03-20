export interface BidsConversionResult {
  status: string;
  data_dir: string;
  output_dir: string;
  n_nii: number;
  n_errors: number;
  n_warnings: number;
  elapsed_seconds: number;
  console_output: string;
  progress: { step: string; message: string }[];
  report_html: string | null;
  return_code: number;
  pending?: boolean;
  stream_url?: string;
}

export type BidsConvertResultItem = { id: string; type: 'bids_conversion'; timestamp: string; data: BidsConversionResult; onComplete?: () => void };

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const text = await res.text();
      try {
        const body = JSON.parse(text);
        detail = body.detail || body.error || detail;
      } catch {
        detail = text || detail;
      }
    } catch { /* ignore */ }
    throw new Error(detail);
  }
  return res.json();
}

export async function runBidsConversion(data_dir: string, output_dir: string): Promise<BidsConversionResult> {
  const res = await fetch('http://localhost:8004/run_bids_conversion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data_dir, output_dir }),
  });
  return handleResponse(res);
}
