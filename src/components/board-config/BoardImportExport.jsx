import React from 'react';
import { BoardConfigButton } from './BoardConfigButton.jsx';

export function BoardImportExport({
  onImport,
  onExport,
  onRefreshBootstrap,
  importing = false,
  exporting = false,
  refreshing = false,
  disabled = false,
}) {
  return (
    <div className="board-settings-io-card d-flex flex-column gap-3">
      <div className="board-settings-io-card__title">Board Import / Export</div>

      <div className="d-flex align-items-center gap-2 flex-wrap">
        <BoardConfigButton
          onClick={onImport}
          disabled={importing || disabled}
          title="Import board from a local JSON file"
        >
          {importing ? 'Importing…' : 'Import Board'}
        </BoardConfigButton>
        <BoardConfigButton
          onClick={onExport}
          disabled={exporting || disabled}
          title="Export the current board as a local JSON file"
        >
          {exporting ? 'Saving…' : 'Export Board'}
        </BoardConfigButton>
        <BoardConfigButton
          onClick={onRefreshBootstrap}
          disabled={refreshing || disabled}
          title="Refresh the ai workspace and admin-cards to bootstrap state"
        >
          {refreshing ? 'Refreshing…' : 'Refresh Workspace Bootstrap'}
        </BoardConfigButton>
      </div>
    </div>
  );
}
