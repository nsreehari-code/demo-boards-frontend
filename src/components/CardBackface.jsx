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
    index,
    bindTo: typeof sourceDef?.bindTo === 'string' ? sourceDef.bindTo : '',
    detailLines: yamlLines,
  };
}

function formatFlightValue(value) {
  if (value == null) {
    return 'null';
  }
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value, null, 2);
}

function normalizeSourceFlightData(data) {
  if (!data || typeof data !== 'object') {
    return { bindTo: '', ok: false, result: null, issues: [] };
  }

  if ('ok' in data || 'result' in data || 'issues' in data) {
    return {
      bindTo: typeof data.bindTo === 'string' ? data.bindTo : '',
      ok: data.ok !== false,
      result: 'result' in data ? data.result : null,
      issues: Array.isArray(data.issues) ? data.issues : [],
    };
  }

  return {
    bindTo: typeof data.bindTo === 'string' ? data.bindTo : '',
    ok: data.reachable !== false,
    result: 'resultValue' in data ? data.resultValue : null,
    issues: typeof data.error === 'string' && data.error.trim()
      ? [data.error.trim()]
      : [],
  };
}

function normalizeCardFlightData(data) {
  if (!data || typeof data !== 'object') {
    return {
      cardId: '',
      ok: false,
      issues: [],
      provides_outputs: {},
      rendered_view: { layout: null, features: null, elements: [] },
      raw: {},
    };
  }

  if ('issues' in data || 'provides_outputs' in data || 'rendered_view' in data) {
    return {
      cardId: typeof data.cardId === 'string' ? data.cardId : '',
      ok: data.ok !== false,
      issues: Array.isArray(data.issues) ? data.issues : [],
      provides_outputs: data.provides_outputs && typeof data.provides_outputs === 'object' ? data.provides_outputs : {},
      rendered_view: data.rendered_view && typeof data.rendered_view === 'object'
        ? data.rendered_view
        : { layout: null, features: null, elements: [] },
      raw: data,
    };
  }

  const issues = [];
  const validationIssues = Array.isArray(data.validation?.issues) ? data.validation.issues : [];
  issues.push(...validationIssues.map(String));
  for (const probe of Array.isArray(data.source_probes) ? data.source_probes : []) {
    if (typeof probe?.error === 'string' && probe.error.trim()) {
      issues.push(probe.error.trim());
    }
  }
  issues.push(...(Array.isArray(data.projection_errors) ? data.projection_errors : []).map(String));
  issues.push(...(Array.isArray(data.compute_errors) ? data.compute_errors : []).map(String));

  return {
    cardId: typeof data.cardId === 'string' ? data.cardId : '',
    ok: data.ok !== false,
    issues,
    provides_outputs: {},
    rendered_view: { layout: null, features: null, elements: [] },
    raw: data,
  };
}

function renderFlightResult(flight) {
  if (!flight) {
    return null;
  }

  if (flight.state === 'running') {
    return (
      <div className="board-card-backface__flight-result board-card-backface__flight-result--running" role="status" aria-live="polite">
        <span className="spinner-border spinner-border-sm" aria-hidden="true" />
        <span>Running preflight...</span>
      </div>
    );
  }

  if (flight.state === 'error') {
    return (
      <div className="board-card-backface__flight-result board-card-backface__flight-result--error" role="alert">
        {flight.error || 'Source preflight failed.'}
      </div>
    );
  }

  if (flight.state !== 'success') {
    return null;
  }

  const data = normalizeSourceFlightData(flight.data && typeof flight.data === 'object' ? flight.data : {});
  const chips = [];

  if (typeof data.bindTo === 'string' && data.bindTo.trim()) {
    chips.push(data.bindTo.trim());
  }
  chips.push(data.ok ? 'ok' : 'failed');

  return (
    <div className="board-card-backface__flight-result board-card-backface__flight-result--success">
      {chips.length > 0 ? (
        <div className="board-card-backface__flight-meta">{chips.join(' | ')}</div>
      ) : null}
      {data.issues.length > 0 ? (
        <div className="board-card-backface__flight-note">{data.issues.join(' | ')}</div>
      ) : null}
      {'result' in data ? (
        <pre className="board-card-backface__flight-value">{formatFlightValue(data.result)}</pre>
      ) : null}
    </div>
  );
}

function renderCardFlightResult(flight) {
  if (!flight) {
    return null;
  }

  if (flight.state === 'running') {
    return (
      <div className="board-card-backface__flight-result board-card-backface__flight-result--running" role="status" aria-live="polite">
        <span className="spinner-border spinner-border-sm" aria-hidden="true" />
        <span>Running card preflight...</span>
      </div>
    );
  }

  if (flight.state === 'error') {
    return (
      <div className="board-card-backface__flight-result board-card-backface__flight-result--error" role="alert">
        {flight.error || 'Card preflight failed.'}
      </div>
    );
  }

  if (flight.state !== 'success') {
    return null;
  }

  const data = normalizeCardFlightData(flight.data && typeof flight.data === 'object' ? flight.data : {});
  const providesOutputs = data.provides_outputs && typeof data.provides_outputs === 'object' ? data.provides_outputs : {};
  const renderedView = data.rendered_view && typeof data.rendered_view === 'object' ? data.rendered_view : {};
  const renderedElements = Array.isArray(renderedView.elements) ? renderedView.elements : [];

  const chips = [];
  if (typeof data.cardId === 'string' && data.cardId.trim()) {
    chips.push(data.cardId.trim());
  }
  if (typeof data.ok === 'boolean') {
    chips.push(data.ok ? 'cycle ok' : 'cycle failed');
  }
  if (data.issues.length > 0) {
    chips.push(`${data.issues.length} issue${data.issues.length === 1 ? '' : 's'}`);
  }
  if (Object.keys(providesOutputs).length > 0) {
    chips.push(`${Object.keys(providesOutputs).length} provide${Object.keys(providesOutputs).length === 1 ? '' : 's'}`);
  }
  if (renderedElements.length > 0) {
    chips.push(`${renderedElements.length} view element${renderedElements.length === 1 ? '' : 's'}`);
  }

  const detail = {
    issues: data.issues,
    provides_outputs: providesOutputs,
    rendered_view: renderedView,
  };

  if (Object.keys(providesOutputs).length === 0 && renderedElements.length === 0 && data.raw && Object.keys(data.raw).length > 0) {
    detail.raw = data.raw;
  }

  return (
    <div className="board-card-backface__flight-result board-card-backface__flight-result--success">
      {chips.length > 0 ? (
        <div className="board-card-backface__flight-meta">{chips.join(' | ')}</div>
      ) : null}
      <pre className="board-card-backface__flight-value">{formatFlightValue(detail)}</pre>
    </div>
  );
}

function ChipRow({ value }) {
  return (
    <span className="board-card-backface__chip">{value}</span>
  );
}

export function CardBackface({
  cardId,
  cardContent,
  cardFlightState,
  flightStateBySource,
  onRunCardFlight,
  onRunFlight,
}) {
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

      {onRunCardFlight ? (
        <div className="board-card-backface__section">
          <div className="board-card-backface__section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
            <span>Card Preflight</span>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm board-card-backface__run-flight-btn"
              onClick={() => onRunCardFlight()}
              disabled={cardFlightState?.state === 'running'}
            >
              {cardFlightState?.state === 'running' ? 'Running...' : 'Run Card Flight'}
            </button>
          </div>
          {renderCardFlightResult(cardFlightState)}
        </div>
      ) : null}
      
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
                <div className="board-card-backface__source-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <strong className="board-card-backface__source-bind">{summary.bindTo || 'unbound'}</strong>
                  {onRunFlight && (
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm board-card-backface__run-flight-btn"
                      title={`Run flight for ${summary.bindTo || 'source'}`}
                      style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem', lineHeight: 1.4 }}
                      onClick={() => onRunFlight({ sourceIndex: summary.index, bindTo: summary.bindTo })}
                      disabled={flightStateBySource?.[summary.index]?.state === 'running'}
                    >
                      {flightStateBySource?.[summary.index]?.state === 'running' ? 'Running...' : 'Run Flight'}
                    </button>
                  )}
                </div>
                <div className="board-card-backface__source-block">
                  {summary.detailLines.map((line, lineIndex) => renderYamlStyledLine(line, `${summary.id}-line-${lineIndex}`))}
                </div>
                {renderFlightResult(flightStateBySource?.[summary.index])}
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
