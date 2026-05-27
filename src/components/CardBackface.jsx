import React from 'react';

function buildSourceSummary(sourceDef, index) {
  const excludedKeys = new Set(['bindTo', 'outputFile', 'projections']);
  const topLevelKinds = Object.keys(sourceDef ?? {}).filter((key) => {
    return !excludedKeys.has(key) && !key.startsWith('_');
  });

  return {
    id: `source-${index}`,
    bindTo: typeof sourceDef?.bindTo === 'string' ? sourceDef.bindTo : '',
    topLevelKinds,
  };
}

function ChipRow({ value }) {
  return (
    <span className="board-card-backface__chip">{value}</span>
  );
}

export function CardBackface({ cardId, cardContent }) {
  const requires = Array.isArray(cardContent?.requires) ? cardContent.requires : [];
  const provides = Array.isArray(cardContent?.provides) ? cardContent.provides : [];
  const sourceDefs = Array.isArray(cardContent?.source_defs) ? cardContent.source_defs : [];
  const viewElements = Array.isArray(cardContent?.view?.elements) ? cardContent.view.elements : [];
  const renderedViews = viewElements
    .map((element) => (typeof element?.kind === 'string' ? element.kind.trim() : ''))
    .filter((kind, index, allKinds) => kind && allKinds.indexOf(kind) === index);
  
  const sourceSummaries = sourceDefs.map((sourceDef, index) => buildSourceSummary(sourceDef, index));

  return (
    <div className="board-card-backface h-100 d-flex flex-column">
      <div className="board-card-backface__title text-truncate" title={cardId}>{cardId}</div>
      
      {/* Depends On Section */}
      {requires.length > 0 && (
        <div className="board-card-backface__section">
          <div className="board-card-backface__section-title">Depends On</div>
          <div className="board-card-backface__chips-row">
            {requires.map((key) => (
              <ChipRow key={`requires-${key}`} value={key} />
            ))}
          </div>
        </div>
      )}

      {/* External Data Section */}
      {sourceSummaries.length > 0 && (
        <div className="board-card-backface__section">
          <div className="board-card-backface__section-title">External Data</div>
          <div className="board-card-backface__list d-flex flex-column">
            {sourceSummaries.map((summary) => (
              <div key={summary.id} className="board-card-backface__source-line">
                <strong className="board-card-backface__source-bind">{summary.bindTo || 'unbound'}</strong>
                <span className="board-card-backface__source-separator">:</span>
                <span className="board-card-backface__source-kinds">
                  {summary.topLevelKinds.length > 0 ? summary.topLevelKinds.join(', ') : 'no source key'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rendered Card Elements Section */}
      {renderedViews.length > 0 && (
        <div className="board-card-backface__section">
          <div className="board-card-backface__section-title">Rendered Card Elements</div>
          <div className="board-card-backface__views-row">
            {renderedViews.map((viewKind) => (
              <span key={`view-${viewKind}`} className="board-card-backface__view-token">{viewKind}</span>
            ))}
          </div>
        </div>
      )}

      {/* Produces Section */}
      {provides.length > 0 && (
        <div className="board-card-backface__section">
          <div className="board-card-backface__section-title">Produces</div>
          <div className="board-card-backface__chips-row">
            {provides.map((item, idx) => (
              <ChipRow key={`provides-${idx}`} value={item.bindTo} />
            ))}
          </div>
        </div>
      )}

      {requires.length === 0 && sourceSummaries.length === 0 && provides.length === 0 && (
        <div className="board-card-backface__empty">No configuration found.</div>
      )}
    </div>
  );
}
