import React from 'react';

// Semantic color key → board tone CSS class. Accepts both the tone names
// (green/amber/red/blue) and Bootstrap-ish aliases (success/warning/danger/…).
const TONE_CLASS = {
  green: 'board-tone--green',
  amber: 'board-tone--amber',
  red: 'board-tone--red',
  blue: 'board-tone--running',
  primary: 'board-tone--running',
  success: 'board-tone--green',
  warning: 'board-tone--amber',
  danger: 'board-tone--red',
  secondary: 'board-tone--secondary',
};

/**
 * Reusable status pill.
 *
 * Props:
 *   value – text to display
 *   tone  – semantic color key (green|amber|red|blue|success|warning|danger|secondary|…)
 */
export function Badge({ value = '', tone = 'secondary' }) {
  const toneClass = TONE_CLASS[tone] ?? `board-tone--${tone}`;
  return <span className={`board-badge ${toneClass}`}>{value}</span>;
}
