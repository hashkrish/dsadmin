import React from "react";
import EntitiesTable from "./EntitiesTable";
import ErrorMessage from "./ui/ErrorMessage";
import Loading from "./ui/Loading";
import useDocumentTitle from "./ui/useDocumentTitle";
import {
  useKinds,
  useKindFields,
  useGQLQueries,
  Entity,
  PropertyValue,
  PropertyType,
} from "./api";

type ValueType =
  | "string"
  | "integer"
  | "double"
  | "boolean"
  | "null"
  | "timestamp"
  | "key"
  | "blob"
  | "geoPoint"
  | "array"
  | "entity"
  | "raw";
type WhereOperator =
  | "="
  | "!="
  | ">"
  | ">="
  | "<"
  | "<="
  | "IN"
  | "HAS ANCESTOR";
type SortDirection = "ASC" | "DESC";
type Aggregation = "none" | "count" | "sum" | "avg" | "min" | "max";

type WhereClause = {
  id: number;
  field: string;
  operator: WhereOperator;
  value: string;
  valueType: ValueType;
};

function escapeString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function escapeDoubleQuoted(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function getNumberValue(value: PropertyValue) {
  if ("integerValue" in value) {
    return Number(value.integerValue);
  }
  if ("doubleValue" in value) {
    return value.doubleValue;
  }
  return null;
}

function calculateAggregation(
  aggregation: Aggregation,
  entities: Entity[] | undefined,
  field: string,
) {
  if (!entities || aggregation === "none") {
    return null;
  }
  if (aggregation === "count") {
    return entities.length;
  }

  const values: number[] = [];
  for (const entity of entities) {
    const property = entity.properties?.[field];
    if (!property) {
      continue;
    }
    const numberValue = getNumberValue(property);
    if (numberValue != null && Number.isFinite(numberValue)) {
      values.push(numberValue);
    }
  }
  if (values.length === 0) {
    return null;
  }

  if (aggregation === "sum") {
    return values.reduce((a, b) => a + b, 0);
  }
  if (aggregation === "avg") {
    return values.reduce((a, b) => a + b, 0) / values.length;
  }
  if (aggregation === "min") {
    return Math.min(...values);
  }
  return Math.max(...values);
}

function parseWhereValue(clause: WhereClause) {
  const trimmedValue = clause.value.trim();
  if (clause.valueType === "string") {
    return `'${escapeString(clause.value)}'`;
  }
  if (clause.valueType === "integer") {
    if (!/^-?\d+$/.test(trimmedValue)) {
      throw new Error(`Integer field "${clause.field}" has an invalid integer value.`);
    }
    return trimmedValue;
  }
  if (clause.valueType === "double") {
    const parsed = Number(trimmedValue);
    if (!Number.isFinite(parsed)) {
      throw new Error(`Double field "${clause.field}" has an invalid number.`);
    }
    return String(parsed);
  }
  if (clause.valueType === "boolean") {
    const normalized = trimmedValue.toLowerCase();
    if (normalized !== "true" && normalized !== "false") {
      throw new Error(`Boolean field "${clause.field}" must be true or false.`);
    }
    return normalized;
  }
  if (clause.valueType === "null") {
    return "NULL";
  }
  if (clause.valueType === "timestamp") {
    if (trimmedValue === "") {
      throw new Error(`Timestamp field "${clause.field}" requires a value.`);
    }
    return `DATETIME("${escapeDoubleQuoted(trimmedValue)}")`;
  }
  if (clause.valueType === "key") {
    if (!/^key\s*\(/i.test(trimmedValue)) {
      throw new Error(
        `Key field "${clause.field}" must use a KEY(...) literal.`,
      );
    }
    return trimmedValue;
  }
  if (clause.valueType === "blob") {
    if (trimmedValue === "") {
      throw new Error(`Blob field "${clause.field}" requires a base64 value.`);
    }
    return `BLOB("${escapeDoubleQuoted(trimmedValue)}")`;
  }
  if (clause.valueType === "geoPoint") {
    const [latRaw, lngRaw] = trimmedValue.split(",").map((v) => v.trim());
    const latitude = Number(latRaw);
    const longitude = Number(lngRaw);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new Error(
        `GeoPoint field "${clause.field}" must be in "lat,lng" format.`,
      );
    }
    return `GEOPT(${latitude}, ${longitude})`;
  }
  if (clause.valueType === "array" || clause.valueType === "entity" || clause.valueType === "raw") {
    if (trimmedValue === "") {
      throw new Error(`Field "${clause.field}" requires a literal value.`);
    }
    return trimmedValue;
  }
  return trimmedValue;
}

function splitInValues(value: string) {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

function buildWhereClause(clause: WhereClause) {
  if (clause.operator === "HAS ANCESTOR") {
    const keyLiteral = parseWhereValue({
      ...clause,
      valueType: "key",
    });
    return `__key__ HAS ANCESTOR ${keyLiteral}`;
  }

  if (clause.operator === "IN") {
    if (clause.valueType === "null") {
      throw new Error(`IN does not support NULL type for "${clause.field}". Use Raw type instead.`);
    }
    const values = splitInValues(clause.value);
    if (values.length === 0) {
      throw new Error(`IN filter for "${clause.field}" requires comma-separated values.`);
    }
    const parsedValues = values.map((value) =>
      parseWhereValue({
        ...clause,
        value,
      }),
    );
    return `${clause.field} IN ARRAY(${parsedValues.join(", ")})`;
  }

  return `${clause.field} ${clause.operator} ${parseWhereValue(clause)}`;
}

function buildQuery(kind: string, clauses: WhereClause[], orderField: string, orderDirection: SortDirection) {
  const whereClauses = clauses
    .filter((clause) => clause.field.trim() !== "")
    .map((clause) => buildWhereClause(clause));

  const wherePart = whereClauses.length > 0 ? ` WHERE ${whereClauses.join(" AND ")}` : "";
  const orderPart = orderField.trim() !== "" ? ` ORDER BY ${orderField} ${orderDirection}` : "";
  return `SELECT * FROM ${kind}${wherePart}${orderPart}`;
}

function expandInClauses(clauses: WhereClause[]) {
  const inClauses = clauses.filter(
    (clause) => clause.field.trim() !== "" && clause.operator === "IN",
  );
  const baseClauses = clauses.filter(
    (clause) => clause.field.trim() !== "" && clause.operator !== "IN",
  );

  let combinations: WhereClause[][] = [baseClauses];
  for (const clause of inClauses) {
    const values = splitInValues(clause.value);
    if (values.length === 0) {
      throw new Error(`IN filter for "${clause.field}" requires comma-separated values.`);
    }
    const nextCombinations: WhereClause[][] = [];
    for (const combo of combinations) {
      for (const value of values) {
        nextCombinations.push([
          ...combo,
          {
            ...clause,
            operator: "=",
            value,
          },
        ]);
      }
    }
    combinations = nextCombinations;
  }

  if (combinations.length > 50) {
    throw new Error("Too many IN combinations. Reduce the number of IN values.");
  }

  return combinations;
}

const typeLabels: Record<ValueType, string> = {
  string: "String",
  integer: "Integer",
  double: "Double",
  boolean: "Boolean",
  null: "Null",
  timestamp: "Timestamp (DATETIME)",
  key: "Key (KEY literal)",
  blob: "Blob (base64)",
  geoPoint: "GeoPoint (lat,lng)",
  array: "Array (raw literal)",
  entity: "Entity (raw literal)",
  raw: "Raw GQL literal",
};

const propertyTypeToValueType: Record<PropertyType, ValueType> = {
  null: "null",
  boolean: "boolean",
  integer: "integer",
  double: "double",
  timestamp: "timestamp",
  key: "key",
  string: "string",
  blob: "blob",
  geoPoint: "geoPoint",
  array: "array",
  entity: "entity",
};

const allValueTypes: ValueType[] = [
  "string",
  "integer",
  "double",
  "boolean",
  "null",
  "timestamp",
  "key",
  "blob",
  "geoPoint",
  "array",
  "entity",
  "raw",
];

export default function QueryBuilderPage({ namespace }: { namespace: string | null }) {
  useDocumentTitle("Query Builder");

  const { data: kinds, error: kindsError, isLoading: kindsLoading } = useKinds(namespace);
  const [kind, setKind] = React.useState("");
  const [whereClauses, setWhereClauses] = React.useState<WhereClause[]>([]);
  const [orderField, setOrderField] = React.useState("");
  const [orderDirection, setOrderDirection] = React.useState<SortDirection>("ASC");
  const [aggregation, setAggregation] = React.useState<Aggregation>("none");
  const [aggregationField, setAggregationField] = React.useState("");
  const [builtQueries, setBuiltQueries] = React.useState<string[]>([]);
  const [queryError, setQueryError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!kind && kinds && kinds.length > 0) {
      setKind(kinds[0]);
    }
  }, [kinds, kind]);

  const {
    data: fields,
    error: fieldsError,
    isLoading: fieldsLoading,
  } = useKindFields(kind || null, namespace);

  React.useEffect(() => {
    if (!fields) {
      return;
    }
    if (orderField && !fields.allFields.includes(orderField)) {
      setOrderField("");
    }
    if (aggregationField && !fields.numericFields.includes(aggregationField)) {
      setAggregationField("");
    }
    setWhereClauses((previous) =>
      previous.map((clause) =>
        fields.allFields.includes(clause.field) || clause.field === "__key__"
          ? clause
          : { ...clause, field: "" },
      ),
    );
  }, [fields, orderField, aggregationField]);

  const {
    data: queryResults,
    error: queryResultsError,
    isLoading: queryResultsLoading,
  } = useGQLQueries(builtQueries, namespace);

  const aggregationValue = React.useMemo(
    () => calculateAggregation(aggregation, queryResults, aggregationField),
    [aggregation, queryResults, aggregationField],
  );

  const addWhereClause = React.useCallback(() => {
    setWhereClauses((previous) => [
      ...previous,
      {
        id: Date.now() + previous.length,
        field: "",
        operator: "=",
        value: "",
        valueType: "string",
      },
    ]);
  }, []);

  const removeWhereClause = React.useCallback((id: number) => {
    setWhereClauses((previous) => previous.filter((clause) => clause.id !== id));
  }, []);

  const updateWhereClause = React.useCallback(
    (id: number, patch: Partial<WhereClause>) => {
      setWhereClauses((previous) =>
        previous.map((clause) => (clause.id === id ? { ...clause, ...patch } : clause)),
      );
    },
    [],
  );

  const runQuery = React.useCallback(() => {
    if (!kind) {
      setQueryError("Choose a table (kind) first.");
      return;
    }
    try {
      const queryVariants = expandInClauses(whereClauses);
      const nextQueries = queryVariants.map((clauses) =>
        buildQuery(kind, clauses, orderField, orderDirection),
      );
      setBuiltQueries(nextQueries);
      setQueryError(null);
    } catch (e) {
      setQueryError((e as Error).message);
    }
  }, [kind, whereClauses, orderField, orderDirection]);

  return (
    <div>
      <div className="card mb-4">
        <div className="card-header fw-bold">Interactive Query Builder</div>
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label">Table (Kind)</label>
              <select
                className="form-select"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
              >
                <option value="">Select kind</option>
                {(kinds || []).map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label">Aggregation</label>
              <div className="d-flex gap-2">
                <select
                  className="form-select"
                  value={aggregation}
                  onChange={(e) => setAggregation(e.target.value as Aggregation)}
                >
                  <option value="none">None</option>
                  <option value="count">COUNT</option>
                  <option value="sum">SUM</option>
                  <option value="avg">AVG</option>
                  <option value="min">MIN</option>
                  <option value="max">MAX</option>
                </select>
                {aggregation !== "none" && aggregation !== "count" ? (
                  <select
                    className="form-select"
                    value={aggregationField}
                    onChange={(e) => setAggregationField(e.target.value)}
                  >
                    <option value="">Select numeric field</option>
                    {(fields?.numericFields || []).map((field) => (
                      <option key={field} value={field}>
                        {field}
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>
            </div>
          </div>

          <hr />

          <div className="d-flex justify-content-between align-items-center mb-2">
            <div className="fw-bold">Where Clause</div>
            <button type="button" className="btn btn-sm btn-outline-primary" onClick={addWhereClause}>
              Add Filter
            </button>
          </div>

          {whereClauses.map((clause) => (
            <div className="row g-2 align-items-center mb-2" key={clause.id}>
              <div className="col-md-3">
                <select
                  className="form-select form-select-sm"
                  value={clause.field}
                  onChange={(e) => {
                    const selectedField = e.target.value;
                    const detectedType = fields?.fieldTypes?.[selectedField]?.[0];
                    const nextType = detectedType
                      ? propertyTypeToValueType[detectedType]
                      : clause.valueType;
                    updateWhereClause(clause.id, {
                      field: selectedField,
                      valueType: nextType,
                    });
                  }}
                >
                  <option value="">Field</option>
                  <option value="__key__">__key__</option>
                  {(fields?.allFields || []).map((field) => (
                    <option key={field} value={field}>
                      {field}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-md-2">
                <select
                  className="form-select form-select-sm"
                  value={clause.operator}
                  onChange={(e) => {
                    const nextOperator = e.target.value as WhereOperator;
                    updateWhereClause(clause.id, {
                      operator: nextOperator,
                      ...(nextOperator === "HAS ANCESTOR"
                        ? { field: "__key__", valueType: "key" as ValueType }
                        : {}),
                    });
                  }}
                >
                  <option value="=">=</option>
                  <option value="!=">!=</option>
                  <option value=">">{">"}</option>
                  <option value=">=">{">="}</option>
                  <option value="<">{"<"}</option>
                  <option value="<=">{"<="}</option>
                  <option value="IN">IN</option>
                  <option value="HAS ANCESTOR">HAS ANCESTOR</option>
                </select>
              </div>
              <div className="col-md-2">
                <select
                  className="form-select form-select-sm"
                  value={clause.valueType}
                  onChange={(e) => updateWhereClause(clause.id, { valueType: e.target.value as ValueType })}
                >
                  {allValueTypes.map((valueType) => (
                    <option key={valueType} value={valueType}>
                      {typeLabels[valueType]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-md-4">
                <input
                  className="form-control form-control-sm"
                  placeholder={
                    clause.operator === "IN"
                      ? "comma separated values"
                      : clause.operator === "HAS ANCESTOR"
                        ? "KEY(AncestorKind, 'id')"
                        : clause.valueType === "boolean"
                      ? "true or false"
                      : clause.valueType === "timestamp"
                        ? "2025-01-01T00:00:00Z"
                        : clause.valueType === "key"
                          ? "KEY(Kind, 'id')"
                          : clause.valueType === "geoPoint"
                            ? "12.34,56.78"
                            : "Value"
                  }
                  value={clause.value}
                  onChange={(e) => updateWhereClause(clause.id, { value: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      runQuery();
                    }
                  }}
                />
              </div>
              <div className="col-md-1">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-danger w-100"
                  onClick={() => removeWhereClause(clause.id)}
                >
                  X
                </button>
              </div>
            </div>
          ))}

          <div className="row g-2 align-items-center mt-2">
            <div className="col-md-3 fw-bold">Order Clause</div>
            <div className="col-md-4">
              <select
                className="form-select form-select-sm"
                value={orderField}
                onChange={(e) => setOrderField(e.target.value)}
              >
                <option value="">No ordering</option>
                {(fields?.allFields || []).map((field) => (
                  <option key={field} value={field}>
                    {field}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-2">
              <select
                className="form-select form-select-sm"
                value={orderDirection}
                onChange={(e) => setOrderDirection(e.target.value as SortDirection)}
              >
                <option value="ASC">ASC</option>
                <option value="DESC">DESC</option>
              </select>
            </div>
          </div>

          <div className="mt-3 d-flex gap-2">
            <button type="button" className="btn btn-primary" onClick={runQuery}>
              Run Query
            </button>
            {builtQueries.length > 0 ? (
              <code className="d-block align-self-center text-truncate">
                {builtQueries[0]}
                {builtQueries.length > 1 ? ` (+${builtQueries.length - 1} variants)` : ""}
              </code>
            ) : null}
          </div>
        </div>
      </div>

      {kindsLoading || fieldsLoading ? <Loading /> : null}
      {kindsError ? <ErrorMessage error={kindsError} /> : null}
      {fieldsError ? <ErrorMessage error={fieldsError} /> : null}
      {queryError ? <ErrorMessage error={queryError} /> : null}
      {queryResultsError ? <ErrorMessage error={queryResultsError} /> : null}
      {queryResultsLoading ? <Loading /> : null}

      {builtQueries.length > 0 && queryResults ? (
        <div className="mb-3">
          <div className="card mb-3">
            <div className="card-body">
              <div>
                <strong>Rows:</strong> {queryResults.length}
              </div>
              {aggregation !== "none" ? (
                <div>
                  <strong>{aggregation.toUpperCase()}:</strong>{" "}
                  {aggregation === "count"
                    ? aggregationValue
                    : `${aggregationField || "(select field)"} = ${aggregationValue ?? "n/a"}`}
                </div>
              ) : null}
            </div>
          </div>
          <EntitiesTable entities={queryResults} namespace={namespace} />
        </div>
      ) : null}
    </div>
  );
}
