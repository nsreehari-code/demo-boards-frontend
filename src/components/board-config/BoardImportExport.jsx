import React from 'react';

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
        <button
          type="button"
          className="btn btn-outline-secondary board-button"
          onClick={onImport}
          disabled={importing || disabled}
          title="Import board from a local JSON file"
        >
          {importing ? 'Importing…' : 'Import Board'}
        </button>
        <button
          type="button"
          className="btn btn-outline-secondary board-button"
          onClick={onExport}
          disabled={exporting || disabled}
          title="Export the current board as a local JSON file"
        >
          {exporting ? 'Saving…' : 'Export Board'}
        </button>
        <button
          type="button"
          className="btn btn-outline-secondary board-button"
          onClick={onRefreshBootstrap}
          disabled={refreshing || disabled}
          title="Refresh the ai workspace and admin-cards to bootstrap state"
        >
          {refreshing ? 'Refreshing…' : 'Refresh Workspace Bootstrap'}
        </button>
      </div>
    </div>
  );
}
