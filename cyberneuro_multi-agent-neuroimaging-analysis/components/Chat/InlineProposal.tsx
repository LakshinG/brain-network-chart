interface Proposal {
  title: string
  description: string
  trigger_query: string
}

interface InlineProposalProps {
  proposals: Proposal[]
  onSelect: (triggerQuery: string) => void
}

export default function InlineProposal({ proposals, onSelect }: InlineProposalProps) {
  if (!proposals || proposals.length === 0) return null

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 12, color: '#a5b4fc', fontWeight: 600, marginBottom: 8 }}>
        Suggested Next Steps
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {proposals.map((p, i) => (
          <button
            key={i}
            onClick={() => onSelect(p.trigger_query)}
            style={{
              textAlign: 'left', padding: '8px 12px', borderRadius: 6,
              background: '#1e293b', border: '1px solid #334155',
              cursor: 'pointer', transition: 'border-color 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = '#818cf8')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = '#334155')}
          >
            <div style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 600 }}>
              {p.title}
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
              {p.description}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
