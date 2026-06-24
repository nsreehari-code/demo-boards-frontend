import React from 'react';
import { BoardConfigButton } from './BoardConfigButton.jsx';
import { SelectControl } from '../shared/Select.jsx';

export function TemplateCardIngest({
  entries = [],
  selectedKey = '',
  onSelect,
  onIngest,
  loading = false,
  ingesting = false,
  preparing = false,
  errorMessage = '',
  disabled = false,
}) {
  const hasEntries = entries.length > 0;

  return (
    <div className="board-settings-io-card d-flex flex-column gap-3">
      <div className="board-settings-io-card__title">Template Card Ingest</div>

      <div className="d-flex align-items-center gap-2 flex-wrap">
        <SelectControl
          className="board-input board-settings-sample-select"
          value={selectedKey}
          options={hasEntries ? entries.map((entry) => ({ value: entry.key, label: entry.label })) : []}
          allowEmpty={!hasEntries}
          emptyLabel={loading ? 'Loading seed boards…' : 'No seed boards available'}
          disabled={loading || ingesting || preparing || !hasEntries}
          ariaLabel="Select a bundled sample board file"
          title={errorMessage || 'Select a bundled sample board file'}
          onChange={(next) => onSelect?.(next)}
        />
        <BoardConfigButton
          onClick={onIngest}
          disabled={ingesting || preparing || disabled || !selectedKey || loading || !hasEntries}
          title="Preview cards that will be added or replaced from the selected template"
        >
          {preparing ? 'Preparing…' : ingesting ? 'Ingesting…' : 'Ingest Cards from Template'}
        </BoardConfigButton>
      </div>
    </div>
  );
}

export function TemplateIngestPreview({
  templateLabel,
  cardsToReplace,
  cardsToAdd,
  invalidCards = [],
  ingesting = false,
  onConfirm,
  onCancel,
}) {
  const hasInvalidCards = invalidCards.length > 0;

  return (
    <div className="d-flex flex-column gap-3">
      <div className="small text-muted">
        Template: <strong>{templateLabel || 'Selected template'}</strong>
      </div>
      <div className="small">
        This will upsert template cards into the current board. Existing cards with matching ids will be replaced. Board label, subtitle, and other board settings will not be changed.
      </div>
      <div className="d-flex gap-3 flex-wrap small">
        <div className="badge text-bg-light border">Replace: {cardsToReplace.length}</div>
        <div className="badge text-bg-light border">Add: {cardsToAdd.length}</div>
        {hasInvalidCards ? (
          <div className="badge border text-bg-danger border-danger">Invalid: {invalidCards.length}</div>
        ) : null}
      </div>
      {hasInvalidCards ? (
        <div className="d-flex flex-column gap-2">
          <div className="fw-semibold small">Invalid cards</div>
          <div className="border border-danger-subtle rounded p-2 bg-danger-subtle" style={{ maxHeight: '180px', overflow: 'auto' }}>
            {invalidCards.map((card, index) => (
              <div key={card.id || `invalid-${index}`} className="small py-1">
                <div>
                  <strong>{card.id || '(missing id)'}</strong>
                  {card.title ? ` - ${card.title}` : ''}
                </div>
                {Array.isArray(card.issues) && card.issues.length > 0 ? (
                  <div className="text-danger-emphasis">
                    {card.issues.join('; ')}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div className="d-flex flex-column gap-2">
        <div className="fw-semibold small">Cards to replace</div>
        {cardsToReplace.length === 0 ? (
          <div className="small text-muted">None.</div>
        ) : (
          <div className="border rounded p-2" style={{ maxHeight: '220px', overflow: 'auto' }}>
            {cardsToReplace.map((card) => (
              <div key={card.id} className="small py-1">
                <strong>{card.id}</strong>
                {card.title ? ` - ${card.title}` : ''}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="d-flex flex-column gap-2">
        <div className="fw-semibold small">New cards to add</div>
        {cardsToAdd.length === 0 ? (
          <div className="small text-muted">None.</div>
        ) : (
          <div className="border rounded p-2" style={{ maxHeight: '160px', overflow: 'auto' }}>
            {cardsToAdd.map((card) => (
              <div key={card.id} className="small py-1">
                <strong>{card.id}</strong>
                {card.title ? ` - ${card.title}` : ''}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="d-flex justify-content-end gap-2">
        <BoardConfigButton onClick={onCancel} disabled={ingesting}>
          Discard
        </BoardConfigButton>
        <BoardConfigButton variant="primary" onClick={onConfirm} disabled={ingesting || hasInvalidCards}>
          {hasInvalidCards ? 'Fix Invalid Cards First' : (ingesting ? 'Ingesting…' : 'Go Ahead')}
        </BoardConfigButton>
      </div>
    </div>
  );
}
