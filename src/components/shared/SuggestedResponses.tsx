import type { SuggestedResponse } from '../../core/types';

interface SuggestedResponsesProps {
  responses: SuggestedResponse[];
  onSelect: (text: string) => void;
  disabled?: boolean;
}

export function SuggestedResponses({ responses, onSelect, disabled }: SuggestedResponsesProps) {
  if (responses.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
      {responses.map((sr, i) => (
        <button
          key={i}
          onClick={() => onSelect(sr.text)}
          disabled={disabled}
          style={{
            padding: '4px 10px',
            borderRadius: 14,
            border: '1px solid #3a4a4a',
            background: 'transparent',
            color: '#80b0a0',
            fontSize: '0.75rem',
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.5 : 1,
          }}
          title={`Intent: ${sr.intent}`}
        >
          {sr.text}
        </button>
      ))}
    </div>
  );
}
