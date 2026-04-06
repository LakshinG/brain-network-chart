import { useState, useRef, useEffect, useCallback } from 'react'
import { DATA_HOST_URL } from '../DicomProcess/BidsConversionCard'

interface InlinePathFormProps {
  onSubmit: (paths: { data_dir: string; output_dir: string; process_dir: string; sc_fc_dir: string }) => void
  disabled?: boolean
}

async function fetchSuggestions(partial: string): Promise<string[]> {
  if (!partial || partial.length < 2) return []
  const dir = partial.endsWith('/') ? partial : partial.substring(0, partial.lastIndexOf('/') + 1)
  if (!dir) return []
  try {
    const res = await fetch(`${DATA_HOST_URL}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cmd: `ls -1 "${dir}"`, cwd: '/' }),
    })
    const { job_id } = await res.json()
    return new Promise((resolve) => {
      const lines: string[] = []
      const es = new EventSource(`${DATA_HOST_URL}/stream/${job_id}`)
      es.onmessage = (e) => {
        const entry = e.data.trim()
        if (entry && !entry.startsWith('[agent')) lines.push(dir + entry)
      }
      es.addEventListener('done', () => { es.close(); resolve(lines) })
      es.onerror = () => { es.close(); resolve(lines) }
    })
  } catch {
    return []
  }
}

const fields = [
  { key: 'data_dir' as const, label: 'DICOM Source Dir', placeholder: '/path/to/dicom' },
  { key: 'output_dir' as const, label: 'BIDS Output Dir', placeholder: '/path/to/bids_output' },
  { key: 'process_dir' as const, label: 'Process Output Dir', placeholder: '/path/to/process_output' },
  { key: 'sc_fc_dir' as const, label: 'SC-FC Output Dir', placeholder: 'sc_fc_output' },
]

export default function InlinePathForm({ onSubmit, disabled }: InlinePathFormProps) {
  const [paths, setPaths] = useState({ data_dir: '', output_dir: '', process_dir: '', sc_fc_dir: '' })
  const [suggestions, setSuggestions] = useState<Record<string, string[]>>({})
  const [activeField, setActiveField] = useState<string | null>(null)
  const debounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const handleChange = useCallback((key: string, value: string) => {
    setPaths(prev => ({ ...prev, [key]: value }))
    if (debounceRef.current[key]) clearTimeout(debounceRef.current[key])
    debounceRef.current[key] = setTimeout(async () => {
      const results = await fetchSuggestions(value)
      setSuggestions(prev => ({ ...prev, [key]: results }))
    }, 300)
  }, [])

  const handleSelect = useCallback((key: string, value: string) => {
    setPaths(prev => ({ ...prev, [key]: value.endsWith('/') ? value : value + '/' }))
    setSuggestions(prev => ({ ...prev, [key]: [] }))
  }, [])

  useEffect(() => {
    return () => {
      Object.values(debounceRef.current).forEach(clearTimeout)
    }
  }, [])

  const allFilled = paths.data_dir && paths.output_dir && paths.process_dir && paths.sc_fc_dir
  const filtered = (key: string) => {
    const val = paths[key as keyof typeof paths]
    return (suggestions[key] ?? []).filter(s => s.startsWith(val) || s.toLowerCase().includes(val.toLowerCase()))
  }

  return (
    <div style={{
      marginTop: 8, padding: 12, borderRadius: 6,
      background: '#0f1117', border: '1px solid #1e293b',
      opacity: disabled ? 0.5 : 1, pointerEvents: disabled ? 'none' : 'auto',
    }}>
      <div style={{ fontSize: 12, color: '#a5b4fc', fontWeight: 600, marginBottom: 10 }}>
        Data Preprocessing Paths
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {fields.map(({ key, label, placeholder }) => (
          <div key={key} style={{ position: 'relative' }}>
            <label style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ minWidth: 120, flexShrink: 0 }}>{label}:</span>
              <input
                value={paths[key]}
                placeholder={placeholder}
                onChange={e => handleChange(key, e.target.value)}
                onFocus={() => setActiveField(key)}
                onBlur={() => setTimeout(() => setActiveField(null), 200)}
                disabled={disabled}
                style={{
                  flex: 1, fontSize: 11, padding: '4px 8px', borderRadius: 4,
                  background: '#1e293b', border: '1px solid #334155',
                  color: '#e2e8f0',
                }}
              />
            </label>
            {activeField === key && filtered(key).length > 0 && (
              <div style={{
                position: 'absolute', left: 128, right: 0, top: '100%', zIndex: 10,
                maxHeight: 150, overflowY: 'auto',
                background: '#1e293b', border: '1px solid #334155', borderRadius: 4,
              }}>
                {filtered(key).map(s => (
                  <div
                    key={s}
                    onMouseDown={() => handleSelect(key, s)}
                    style={{
                      padding: '3px 8px', fontSize: 11, color: '#7dd3fc', cursor: 'pointer',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#334155')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    {s}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <button
        onClick={() => { console.log('[InlinePathForm] click, allFilled=', allFilled, 'paths=', paths); if (allFilled) onSubmit(paths); }}
        disabled={!allFilled || disabled}
        style={{
          marginTop: 12, fontSize: 12, padding: '6px 16px', borderRadius: 6,
          border: 'none', cursor: allFilled && !disabled ? 'pointer' : 'not-allowed',
          background: allFilled ? '#4f46e5' : '#334155',
          color: allFilled ? '#fff' : '#64748b',
          fontWeight: 600,
        }}
      >
        Start Conversion
      </button>
    </div>
  )
}
