import {
  parseWatchpartyAgentToolPayloads,
  parseWatchpartyAgentToolPayload,
  WATCHPARTY_AGENT_TOOL_ACTIONS,
} from './watchparty-agent-tools.js';

function titleCase(text) {
  return String(text || '')
    .split(/[._\-\s]+/g)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
    .trim();
}

function humanizeToolName(tool) {
  const normalized = typeof tool === 'string' ? tool.trim() : '';
  if (!normalized) return 'Unknown MCP Tool';
  return titleCase(normalized.replace(/^liveboards\./, '')) || 'Unknown MCP Tool';
}

function humanizeAction(action) {
  switch (action) {
    case WATCHPARTY_AGENT_TOOL_ACTIONS.INVOKING:
      return 'Invoking';
    case WATCHPARTY_AGENT_TOOL_ACTIONS.COMPLETED:
      return 'Completed';
    case WATCHPARTY_AGENT_TOOL_ACTIONS.FAILED:
      return 'Failed';
    default:
      return titleCase(action || '');
  }
}

function joinPhrases(parts) {
  const filtered = parts.filter((part) => typeof part === 'string' && part.trim().length > 0);
  if (filtered.length === 0) return '';
  if (filtered.length === 1) return ` ${filtered[0]}`;
  if (filtered.length === 2) return ` ${filtered[0]} and ${filtered[1]}`;
  return ` ${filtered.slice(0, -1).join(', ')} and ${filtered[filtered.length - 1]}`;
}

export function formatWatchpartyAgentToolPayload(payload) {
  const normalized = parseWatchpartyAgentToolPayload(payload);
  if (!normalized) return '';

  const parts = [];
  if (normalized.card_id) {
    parts.push(`for ${normalized.card_id}`);
  }
  if (Number.isInteger(normalized.file_idx)) {
    parts.push(`file no. ${normalized.file_idx}`);
  }

  return `${humanizeAction(normalized.action)} '${humanizeToolName(normalized.tool)}'${joinPhrases(parts)}`;
}

export {
  parseWatchpartyAgentToolPayload,
  parseWatchpartyAgentToolPayloads,
  WATCHPARTY_AGENT_TOOL_ACTIONS,
};