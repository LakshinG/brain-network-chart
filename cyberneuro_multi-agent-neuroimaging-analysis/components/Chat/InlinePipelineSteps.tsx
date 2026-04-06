import { useState, useRef, useEffect } from 'react'
import { DATA_HOST_URL } from '../DicomProcess/BidsConversionCard'

interface Step {
  label: string
  note: string
  cmd: string
}

interface RunningJob {
  stepLabel: string
  jobId: string
  es: EventSource
}

interface InlinePipelineStepsProps {
  bidsDir: string
  pipelineDir: string
  processDir: string
  scFcDir: string
  sessionId: string
  onAllComplete: () => void
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button onClick={handleCopy} style={{
      fontSize: 10, padding: '1px 8px', borderRadius: 4,
      border: '1px solid #334155',
      background: copied ? '#14532d' : '#1e293b',
      color: copied ? '#4ade80' : '#64748b',
      cursor: 'pointer', flexShrink: 0,
    }}>
      {copied ? '\u2713' : 'Copy'}
    </button>
  )
}

export default function InlinePipelineSteps({
  bidsDir, pipelineDir, processDir, scFcDir, sessionId, onAllComplete,
}: InlinePipelineStepsProps) {
  const [runningJob, setRunningJob] = useState<RunningJob | null>(null)
  const [stepOutputs, setStepOutputs] = useState<Record<string, string[]>>({})
  const [expandedStep, setExpandedStep] = useState<string | null>(null)
  const [stepExitCodes, setStepExitCodes] = useState<Record<string, number>>({})
  const terminalEndRef = useRef<HTMLDivElement>(null)
  const completeFiredRef = useRef(false)

  const PS = pipelineDir
  const B = bidsDir
  const P = processDir
  const S = scFcDir

  const steps: Step[] = [
    { label: 'Install', note: 'Download container images (~24 GB, one-time)', cmd: `cd "${PS}" && bash install.sh` },
    { label: 'Validate', note: 'Pre-flight checks (config, containers, tools)', cmd: `cd "${PS}" && bash validate.sh` },
    { label: 'Pipeline', note: 'Run full pipeline (proc.sh)', cmd: `cd "${PS}" && bash proc.sh "${B}" "${P}" "${S}"` },
  ]

  // Cleanup EventSource on unmount
  useEffect(() => {
    return () => { runningJob?.es.close() }
  }, [runningJob])

  // Notify parent when Pipeline step finishes (fire only once)
  useEffect(() => {
    if (stepExitCodes['Pipeline'] !== undefined && !completeFiredRef.current) {
      completeFiredRef.current = true
      onAllComplete()
    }
  }, [stepExitCodes, onAllComplete])

  async function updateSessionStep(label: string, status: string, exitCode?: number) {
    try {
      await fetch(`${DATA_HOST_URL}/sessions/${sessionId}/steps/${label}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, ...(exitCode !== undefined ? { exit_code: exitCode } : {}) }),
      })
    } catch { /* ignore */ }
  }

  async function handleRun(step: Step) {
    if (runningJob) return
    setStepOutputs(prev => ({ ...prev, [step.label]: [] }))
    setExpandedStep(step.label)
    updateSessionStep(step.label, 'running')

    const onLine = (line: string) => {
      setStepOutputs(prev => ({ ...prev, [step.label]: [...(prev[step.label] ?? []), line] }))
      setTimeout(() => terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 0)
    }
    const onDone = (exitCode: number) => {
      setStepExitCodes(prev => ({ ...prev, [step.label]: exitCode }))
      setRunningJob(null)
      updateSessionStep(step.label, exitCode === 0 ? 'done' : 'failed', exitCode)
    }

    try {
      const resp = await fetch(`${DATA_HOST_URL}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cmd: step.cmd, cwd: pipelineDir }),
      })
      if (!resp.ok) throw new Error(`Agent error ${resp.status}`)
      const { job_id } = await resp.json()
      const es = new EventSource(`${DATA_HOST_URL}/stream/${job_id}`)
      es.onmessage = (e) => onLine(e.data)
      es.addEventListener('done', (e) => {
        const { exit_code } = JSON.parse((e as MessageEvent).data)
        onDone(exit_code); es.close()
      })
      es.onerror = () => { onDone(-1); es.close() }
      setRunningJob({ stepLabel: step.label, jobId: job_id, es })
    } catch (err) {
      setStepOutputs(prev => ({ ...prev, [step.label]: [`[error] ${String(err)}`] }))
      updateSessionStep(step.label, 'failed', -1)
    }
  }

  async function handleCancel() {
    if (!runningJob) return
    try {
      await fetch(`${DATA_HOST_URL}/cancel/${runningJob.jobId}`, { method: 'POST' })
    } catch { /* ignore */ }
    runningJob.es.close()
    setRunningJob(null)
  }

  return (
    <div style={{
      marginTop: 8, padding: 12, borderRadius: 6,
      background: '#0f1117', border: '1px solid #1e293b',
    }}>
      <div style={{ fontSize: 12, color: '#a5b4fc', fontWeight: 600, marginBottom: 10 }}>
        Pipeline Steps
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {steps.map((s) => {
          const isRunningThis = runningJob?.stepLabel === s.label
          const isRunningOther = !!runningJob && !isRunningThis
          const outputs = stepOutputs[s.label] ?? []
          const exitCode = stepExitCodes[s.label]
          const hasExitCode = exitCode !== undefined
          const isExpanded = expandedStep === s.label

          return (
            <div key={s.label} style={{ borderRadius: 4, border: '1px solid #1e293b', overflow: 'hidden' }}>
              {/* Header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '4px 10px', background: '#151b27',
              }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, color: '#a5b4fc',
                  minWidth: 44, textTransform: 'uppercase', letterSpacing: '0.05em',
                }}>
                  {s.label}
                </span>
                <span style={{ fontSize: 11, color: '#64748b', flex: 1 }}>{s.note}</span>

                {hasExitCode && (
                  <span style={{
                    fontSize: 10, padding: '1px 6px', borderRadius: 3,
                    background: exitCode === 0 ? '#14532d' : '#450a0a',
                    color: exitCode === 0 ? '#4ade80' : '#f87171',
                  }}>
                    {exitCode === 0 ? 'Done' : `Exit ${exitCode}`}
                  </span>
                )}

                <CopyButton text={s.cmd} />

                {isRunningThis ? (
                  <button onClick={handleCancel} style={{
                    fontSize: 10, padding: '1px 8px', borderRadius: 4,
                    border: '1px solid #7f1d1d', background: '#1e293b',
                    color: '#f87171', cursor: 'pointer', flexShrink: 0,
                  }}>
                    Cancel
                  </button>
                ) : (
                  <button
                    onClick={() => handleRun(s)}
                    disabled={isRunningOther}
                    style={{
                      fontSize: 10, padding: '1px 8px', borderRadius: 4,
                      border: '1px solid #334155', background: '#1e293b',
                      color: isRunningOther ? '#334155' : '#a5b4fc',
                      cursor: isRunningOther ? 'not-allowed' : 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    Run
                  </button>
                )}

                {outputs.length > 0 && (
                  <button
                    onClick={() => setExpandedStep(isExpanded ? null : s.label)}
                    style={{
                      fontSize: 10, padding: '1px 6px', borderRadius: 4,
                      border: '1px solid #334155', background: 'transparent',
                      color: '#64748b', cursor: 'pointer', flexShrink: 0,
                    }}
                  >
                    {isExpanded ? '\u25B2' : '\u25BC'}
                  </button>
                )}
              </div>

              {/* Command */}
              <pre style={{
                margin: 0, padding: '6px 10px',
                background: '#0a0d14', color: '#7dd3fc',
                fontSize: 11, lineHeight: 1.6,
                whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              }}>
                {s.cmd}
              </pre>

              {/* Terminal output */}
              {isExpanded && outputs.length > 0 && (
                <pre style={{
                  margin: 0, padding: '8px 10px',
                  background: '#050709', color: '#94a3b8',
                  fontSize: 10.5, lineHeight: 1.6,
                  maxHeight: 300, overflowY: 'auto',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  borderTop: '1px solid #1e293b',
                }}>
                  {outputs.join('\n')}
                  {isRunningThis && <span style={{ color: '#4ade80' }}>{'\u2588'}</span>}
                  <div ref={isRunningThis ? terminalEndRef : undefined} />
                </pre>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
