import React from 'react';

function formatScalar(value) {
  if (value == null) {
    return 'null';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

function toYamlLines(value, indent = 0) {
  const pad = ' '.repeat(indent);

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return [`${pad}[]`];
    }
    return value.flatMap((item) => {
      if (item && typeof item === 'object') {
        return [`${pad}-`, ...toYamlLines(item, indent + 2)];
      }
      return [`${pad}- ${formatScalar(item)}`];
    });
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return [`${pad}{}`];
    }
    return entries.flatMap(([key, entry]) => {
      if (entry && typeof entry === 'object') {
        return [`${pad}${key}:`, ...toYamlLines(entry, indent + 2)];
      }
      return [`${pad}${key}: ${formatScalar(entry)}`];
    });
  }

  return [`${pad}${formatScalar(value)}`];
}

function renderYamlStyledLine(line, key) {
  const match = line.match(/^(\s*)([^:\s][^:]*):(?:\s(.*))?$/);
  if (!match) {
    return (
      <div key={key} className="board-card-backface__source-block-line">
        {line}
      </div>
    );
  }

  const [, indent, fieldKey, fieldValue] = match;
  const keyClassName = indent.length === 0
    ? 'board-card-backface__source-block-key board-card-backface__source-block-key--top'
    : 'board-card-backface__source-block-key';
  const lineClassName = fieldKey === 'projections' && indent.length === 0
    ? 'board-card-backface__source-block-line board-card-backface__source-block-line--projections'
    : 'board-card-backface__source-block-line';
  return (
    <div key={key} className={lineClassName}>
      <span>{indent}</span>
      <span className={keyClassName}>{fieldKey}</span>
      <span className="board-card-backface__source-block-colon">:</span>
      {fieldValue !== undefined && fieldValue !== '' ? (
        <>
          <span> </span>
          <span className="board-card-backface__source-block-value">{fieldValue}</span>
        </>
      ) : null}
    </div>
  );
}

function buildSourceSummary(sourceDef, index) {
  const excludedKeys = new Set([
    'bindTo',
    'outputFile',
    'projections',
    'optionalForCompletionGating',
    'timeout',
    'script',
  ]);
  const kindKey = Object.keys(sourceDef ?? {}).find((key) => {
    return !excludedKeys.has(key) && !key.startsWith('_');
  });
  const kindValue = kindKey ? sourceDef?.[kindKey] : null;
  const projections = sourceDef?.projections && typeof sourceDef.projections === 'object'
    ? sourceDef.projections
    : null;

  const yamlLines = [];
  if (kindKey) {
    yamlLines.push(`${kindKey}:`);
    yamlLines.push(...toYamlLines(kindValue, 2));
  }
  if (projections && Object.keys(projections).length > 0) {
    yamlLines.push('projections:');
    yamlLines.push(...toYamlLines(projections, 2));
  }
  if (yamlLines.length === 0) {
    yamlLines.push('no source definition details');
  }

  return {
    id: `source-${index}`,
    bindTo: typeof sourceDef?.bindTo === 'string' ? sourceDef.bindTo : '',
    detailLines: yamlLines,
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
      
      {/* Depends On + Produces Row */}
      {(requires.length > 0 || provides.length > 0) && (
        <div className="board-card-backface__io-row">
          {requires.length > 0 && (
            <div className="board-card-backface__section board-card-backface__section--io">
              <div className="board-card-backface__section-title">Depends On</div>
              <div className="board-card-backface__chips-row">
                {requires.map((key) => (
                  <ChipRow key={`requires-${key}`} value={key} />
                ))}
              </div>
            </div>
          )}

          {provides.length > 0 && (
            <div className="board-card-backface__section board-card-backface__section--io">
              <div className="board-card-backface__section-title">Produces</div>
              <div className="board-card-backface__chips-row">
                {provides.map((item, idx) => (
                  <ChipRow key={`provides-${idx}`} value={item.bindTo} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* External Data Section */}
      {sourceSummaries.length > 0 && (
        <div className="board-card-backface__section">
          <div className="board-card-backface__section-title">External Data</div>
          <div className="board-card-backface__list d-flex flex-column">
            {sourceSummaries.map((summary) => (
              <div key={summary.id} className="board-card-backface__source-line">
                <div className="board-card-backface__source-header">
                  <strong className="board-card-backface__source-bind">{summary.bindTo || 'unbound'}</strong>
                </div>
                <div className="board-card-backface__source-block">
                  {summary.detailLines.map((line, lineIndex) => renderYamlStyledLine(line, `${summary.id}-line-${lineIndex}`))}
                </div>
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

      {requires.length === 0 && sourceSummaries.length === 0 && provides.length === 0 && (
        <div className="board-card-backface__empty">No configuration found.</div>
      )}
    </div>
  );
}
