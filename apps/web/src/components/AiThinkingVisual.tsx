import React from 'react'
import { Sparkles, AlertCircle } from 'lucide-react'

export type AiActivityState = 'idle' | 'thinking' | 'generating' | 'streaming' | 'completed' | 'error'

interface AiThinkingVisualProps {
  state: AiActivityState
  size?: 'sm' | 'md' | 'lg'
  label?: string
  minimal?: boolean
  hasScreenShare?: boolean
  className?: string
}

export const AiThinkingVisual: React.FC<AiThinkingVisualProps> = ({
  state,
  size = 'md',
  label,
  minimal = false,
  hasScreenShare = false,
  className = ''
}) => {
  const defaultLabel =
    state === 'thinking'
      ? 'Thinking…'
      : state === 'generating'
      ? 'Generating…'
      : state === 'streaming'
      ? 'Streaming…'
      : state === 'error'
      ? 'Generation error'
      : state === 'completed'
      ? 'Completed'
      : 'Ready'

  const displayLabel = label ?? defaultLabel

  return (
    <div
      className={`ai-activity-visual state-${state} size-${size} ${minimal ? 'is-minimal' : ''} ${
        hasScreenShare ? 'has-screen-share' : ''
      } ${className}`}
      data-state={state}
      aria-live="polite"
    >
      <div className="ai-orb-container">
        {/* Soft ambient fluid glow */}
        <div className="ai-orb-glow" />
        {/* Rotating multicolored gradient aura */}
        <div className="ai-orb-aura" />
        {/* Fine luminous ring activated during screen sharing */}
        {hasScreenShare && <div className="ai-screen-ring" />}
        {/* Translucent intelligence core with fluid depth */}
        <div className="ai-orb-core">
          <div className="ai-orb-inner-fluid" />
          {state === 'error' ? (
            <AlertCircle size={size === 'sm' ? 11 : size === 'lg' ? 18 : 13} className="ai-orb-icon error" />
          ) : (
            <Sparkles size={size === 'sm' ? 11 : size === 'lg' ? 18 : 13} className="ai-orb-icon" />
          )}
        </div>
      </div>

      {!minimal && (
        <div className="ai-activity-copy">
          <span className="ai-activity-label">{displayLabel}</span>
          {(state === 'thinking' || state === 'generating' || state === 'streaming') && (
            <span className="ai-activity-dots">
              <span className="dot dot-1" />
              <span className="dot dot-2" />
              <span className="dot dot-3" />
            </span>
          )}
        </div>
      )}
    </div>
  )
}

export default AiThinkingVisual
