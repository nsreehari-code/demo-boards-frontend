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
 *   themePackId          – current theme pack id ('mist-ops' | 'signal-room' | null)
 *   onToggleTheme        – () => void; cycle to the next theme
 *   themeToggleDisabled  – disables the theme toggle button
 *   togglingTheme        – whether a theme toggle is in flight
 *   smokeRunnerEnabled   – whether the Run Tests icon button should be shown
 *   onRunSmokeRunner     – () => void; open the smoke runner
 *   smokeRunnerTitle     – tooltip for the Run Tests icon button
 *   smokeStrategistEnabled – whether the Run Strategist icon button should be shown
 *   onRunStrategist      – () => void; open the strategist smoke suite
 *   smokeStrategistTitle – tooltip for the Run Strategist icon button
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
  themePackId = null,
  onToggleTheme,
  themeToggleDisabled = false,
  togglingTheme = false,
  smokeRunnerEnabled = false,
  onRunSmokeRunner,
  smokeRunnerTitle = '',
  smokeStrategistEnabled = false,
  onRunStrategist,
  smokeStrategistTitle = '',
}) {
  const showLayoutToggle = typeof onToggleLayout === 'function';
  const showThemeToggle = typeof onToggleTheme === 'function';
  const isCardsLayout = layoutKind === 'flowing-cards';
  const isSignalRoom = themePackId === 'signal-room';
  const showRunButtons = smokeRunnerEnabled || smokeStrategistEnabled;
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
          {showRunButtons ? null : 'Switch'}
        </BoardConfigButton>
        {smokeRunnerEnabled ? (
          <BoardConfigButton
            icon="bi-flask"
            className="d-inline-flex align-items-center justify-content-center"
            onClick={onRunSmokeRunner}
            title={smokeRunnerTitle}
            aria-label={smokeRunnerTitle || 'Run tests'}
            data-testid="board-settings-smoke-test-button"
          />
        ) : null}
        {smokeStrategistEnabled ? (
          <BoardConfigButton
            icon="bi-compass"
            className="d-inline-flex align-items-center justify-content-center"
            onClick={onRunStrategist}
            title={smokeStrategistTitle}
            aria-label={smokeStrategistTitle || 'Run strategist'}
            data-testid="board-settings-smoke-strategist-button"
          />
        ) : null}
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
        {showThemeToggle ? (
          <BoardConfigButton
            icon={isSignalRoom ? 'bi-brightness-high' : 'bi-moon-stars'}
            className="d-inline-flex align-items-center justify-content-center"
            onClick={onToggleTheme}
            disabled={themeToggleDisabled || themePackId == null || togglingTheme}
            title={isSignalRoom ? 'Switch to mist-ops theme' : 'Switch to signal-room theme'}
            aria-label={isSignalRoom ? 'Switch to mist-ops theme' : 'Switch to signal-room theme'}
            data-testid="board-settings-toggle-theme-button"
          />
        ) : null}
      </div>
    </div>
  );
}
