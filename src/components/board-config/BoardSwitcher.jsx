import React from 'react';
import { BoardConfigButton } from './BoardConfigButton.jsx';

const FORWARD_ICON_SVG = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M5 12h12"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
    />
    <path
      d="M13 6l6 6-6 6"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * Board picker shown in the settings modal header: a select of available boards
 * plus a "Switch" button that activates the chosen board.
 *
 * Props:
 *   value          – currently selected board id
 *   options        – [{ id, label }] board choices
 *   currentBoardId – the active board id (marked "(current)"; disables Switch
 *                    while it equals `value`)
 *   onChange       – (event) => void; select change handler
 *   onSwitch       – () => void; activate the selected board
 *   selectDisabled – disables the select (e.g. wrong transport / loading)
 *   loading        – whether the board list is still loading (placeholder text)
 *   layoutKind     – current centre-pane layout kind ('infinite-canvas' | 'flowing-cards')
 *   onToggleLayout – () => void; flip the selected board's layout kind
 *   layoutToggleDisabled – disables the layout toggle button
 *   togglingLayout – whether a layout toggle is in flight
 */
export function BoardSwitcher({
  value,
  options = [],
  currentBoardId,
  onChange,
  onSwitch,
  selectDisabled = false,
  loading = false,
  layoutKind = null,
  onToggleLayout,
  layoutToggleDisabled = false,
  togglingLayout = false,
}) {
  const showLayoutToggle = typeof onToggleLayout === 'function';
  const isCardsLayout = layoutKind === 'flowing-cards';
  return (
    <div className="board-settings-modal__header-content">
      <div className="board-settings-modal__eyebrow mb-2">Board</div>
      <div className="d-flex align-items-center gap-2 board-settings-board-row">
        <select
          className="board-input board-settings-sample-select board-settings-board-select"
          value={value}
          onChange={onChange}
          disabled={selectDisabled}
          data-testid="board-settings-board-select"
        >
          {options.length === 0 ? (
            <option value="">
              {loading ? 'Loading boards…' : 'No boards available'}
            </option>
          ) : null}
          {options.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}{entry.id === currentBoardId ? ' (current)' : ''}
            </option>
          ))}
        </select>
        <BoardConfigButton
          variant="primary"
          iconNode={FORWARD_ICON_SVG}
          className="board-settings-go-button"
          onClick={onSwitch}
          disabled={value === currentBoardId}
          title="Switch board"
          aria-label="Switch board"
        >
          Switch
        </BoardConfigButton>
        {showLayoutToggle ? (
          <BoardConfigButton
            icon={isCardsLayout ? 'bi-diagram-3' : 'bi-bounding-box'}
            className="ms-auto d-inline-flex align-items-center justify-content-center"
            onClick={onToggleLayout}
            disabled={layoutToggleDisabled || layoutKind == null || togglingLayout}
            title={
              isCardsLayout
                ? 'Switch this board to the infinite canvas layout'
                : 'Switch this board to the flowing cards layout'
            }
            aria-label={
              isCardsLayout
                ? 'Switch this board to the infinite canvas layout'
                : 'Switch this board to the flowing cards layout'
            }
            data-testid="board-settings-toggle-layout-button"
          />
        ) : null}
      </div>
    </div>
  );
}
