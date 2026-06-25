import React, { useState, useEffect } from 'react';
import { ChatIconShell } from './ChatIconShell.jsx';

/**
 * Shared "AI working" / Watch Party live-activity bubble.
 *
 * Renders the animated "AI working..." indicator plus optional live agent
 * activity chips (output + tools). It is fully prop-driven so it can be reused
 * by the chat pane and any watch-party surface without depending on chat hooks.
 *
 * Props:
 *  - `agentOutput`   — latest agent output text (string).
 *  - `agentTools`    — latest agent tools text (string).
 *  - `cardId`        — used to build the `data-testid` for tests.
 *  - `compact`       — when true, disables the label shimmer animation.
 *  - `onLayoutChange`— called when the rendered layout/height changes so the
 *                      host can re-anchor scrolling.
 */

function WorkingBubbleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

const processingStates = [
  'The mission is underway…',
  'Engaging hyperdrive…',
  'Activating mission protocols…',
  'Calculating the jump…',
  'Scanning the galaxy…',
  'The Force is in motion…',
  'Forces are at work…',
];

const toolStates = [
  'Chewie, get us ready…',
  'Summoning the council…',
  'R2 is working on it…',
  'Summoning the squadron…',
  'Deploying the squadron…',
  'Calling in support…',
  'Tactical units mobilised',
  'Companions joining',
  'Power is gathering',
];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function toChipPreview(text) {
  const source = String(text ?? '');
  const lines = source.split(/\r?\n/g);
  const raw = [...lines].reverse().find((line) => line.trim())?.trim() || source.trim();
  return raw || '';
}

export function AgentWorkingBubble({ agentOutput = '', agentTools = '', cardId, compact = false, onLayoutChange }) {
  const [activeChipKey, setActiveChipKey] = useState('');
  const [chipLabels] = useState(() => ({
    output: pickRandom(processingStates),
    tools: pickRandom(toolStates),
  }));
  const liveOutput = typeof agentOutput === 'string' ? agentOutput : '';
  const liveTools = typeof agentTools === 'string' ? agentTools : '';
  const chips = [
    liveOutput ? { key: 'output', label: chipLabels.output, value: toChipPreview(liveOutput), fullText: liveOutput } : null,
    liveTools ? { key: 'tools', label: chipLabels.tools, value: toChipPreview(liveTools), fullText: liveTools } : null,
  ].filter(Boolean);
  const activeChip = chips.find((chip) => chip.key === activeChipKey) ?? null;

  useEffect(() => {
    onLayoutChange?.();
  }, [activeChipKey, chips.length, onLayoutChange]);

  return (
    <div className="d-flex mb-2 w-100" data-testid={`chat-working-bubble-${cardId}`}>
      <div
        className="board-chat-pane__working-bubble px-2 py-1 rounded-3 small fst-italic d-inline-flex flex-column align-items-stretch w-100"
        style={{
          maxWidth: '100%',
          gap: '0.45rem',
        }}
      >
        <div className="d-inline-flex align-items-center" style={{ gap: '0.45rem' }}>
          <ChatIconShell>
            <WorkingBubbleIcon />
          </ChatIconShell>
          <span>AI working...</span>
          <span
            className="spinner-border spinner-border-sm flex-shrink-0"
            role="status"
            aria-label="AI working"
            style={{ width: '0.75rem', height: '0.75rem', borderWidth: '0.12em' }}
          />
        </div>
        {chips.length > 0 ? (
          <div className="d-flex flex-column align-items-stretch" style={{ gap: '0.35rem' }}>
            {chips.map((chip) => (
              <button
                key={chip.label}
                type="button"
                className={`board-chat-pane__working-chip badge rounded-pill border text-body-emphasis ${activeChipKey === chip.key ? 'text-bg-primary' : 'text-bg-light'}`}
                title={chip.value}
                style={{
                  width: '100%',
                  maxWidth: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  minWidth: 0,
                  overflow: 'hidden',
                }}
                onClick={() => {
                  setActiveChipKey((prev) => (prev === chip.key ? '' : chip.key));
                }}
              >
                <span className={`board-chat-pane__chip-label${activeChipKey === chip.key || compact ? '' : ' board-chat-pane__chip-label--shimmer'}`}>
                  {chip.label}
                </span>
                <span className="board-chat-pane__chip-separator">&nbsp;&nbsp;</span>
                <span
                  className="board-chat-pane__chip-value"
                  style={{
                    flex: '1 1 auto',
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    textAlign: 'left',
                  }}
                >
                  {chip.value}
                </span>
              </button>
            ))}
          </div>
        ) : null}
        {activeChip ? (
          <div
            className="mb-0 rounded-2 p-2"
            style={{
              background: 'rgba(255,255,255,0.7)',
              border: '1px solid rgba(0,0,0,0.08)',
              color: 'var(--bs-body-color, #212529)',
              fontStyle: 'italic',
              fontSize: '0.8rem',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {activeChip.value}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default AgentWorkingBubble;
