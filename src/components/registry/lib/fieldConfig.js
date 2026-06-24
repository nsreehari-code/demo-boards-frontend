// Single-field form helpers shared by selection / searchbox / query / form
// views. Authored to the uniform prop contract: components receive `spec`
// (static config), resolved `data`, and the engine-resolved `currentValue`.

export function getObjectColumns(rows, configuredColumns) {
  if (Array.isArray(configuredColumns) && configuredColumns.length) return configuredColumns;
  const keys = new Set();
  for (const row of rows) {
    if (row && typeof row === 'object' && !Array.isArray(row)) {
      Object.keys(row).forEach((key) => keys.add(key));
    }
  }
  return [...keys];
}

export function mergeRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({ ...(row ?? {}) }));
}

export function buildEditorSaveValue(writeTo, fieldKey, nextValue) {
  if (writeTo === 'card_data') {
    return { [fieldKey]: nextValue };
  }
  return nextValue;
}

// Returns the single-field descriptor when `spec.fields` declares exactly one
// property, else null. `currentValue` is the engine-resolved write value;
// `writeTo` is the node's write path (used to unwrap card_data field maps).
export function getSingleFieldConfig(spec, data, currentValue, writeTo) {
  const schema = spec?.fields ?? {};
  const props = schema.properties ?? {};
  const entries = Object.entries(props);
  if (entries.length !== 1) return null;

  const [fieldKey, prop] = entries[0];
  const fieldValue = writeTo === 'card_data'
    ? (currentValue && typeof currentValue === 'object' && !Array.isArray(currentValue)
      ? currentValue[fieldKey]
      : undefined)
    : currentValue;

  let options = [];
  if (Array.isArray(prop?.enum)) {
    options = prop.enum;
  } else if (Array.isArray(data)) {
    options = data;
  } else if (data && typeof data === 'object' && !Array.isArray(data)) {
    if (Array.isArray(data[fieldKey])) {
      options = data[fieldKey];
    } else if (Array.isArray(data.options)) {
      options = data.options;
    }
  }

  return {
    spec,
    schema,
    fieldKey,
    prop: prop ?? {},
    currentValue: fieldValue,
    options,
    isRequired: Array.isArray(schema.required) && schema.required.includes(fieldKey),
  };
}
