import classNames from "classnames";
import React from "react";
import { Link } from "wouter";
import truncate from "lodash/truncate";
import { PropertyValue, useProject } from "./api";
import { encodeKey, keyToString } from "./keys";
import { valueToString } from "./properties";

function EntityValueView({
  properties,
  namespace,
}: {
  properties: Record<string, unknown>;
  namespace: string | null;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const keys = Object.keys(properties);
  const limit = 4;
  const visibleKeys = expanded ? keys : keys.slice(0, limit);

  if (keys.length === 0) {
    return <span className="text-muted small">{"{}"}</span>;
  }

  return (
    <div className="rounded border bg-light p-1" style={{ fontSize: "0.85em", minWidth: "200px" }}>
      {visibleKeys.map((key) => (
        <div key={key} className="d-flex flex-row mb-1">
          <span
            className="fw-bold text-secondary me-1 text-truncate"
            style={{ maxWidth: "100px", minWidth: "50px" }}
            title={key}
          >
            {key}:
          </span>
          <div className="flex-grow-1" style={{ minWidth: 0 }}>
            <PropertyValueView
              value={properties[key] as PropertyValue}
              isShort={true}
              namespace={namespace}
            />
          </div>
        </div>
      ))}
      {keys.length > limit && (
        <div className="text-center border-top mt-1 pt-1">
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="text-decoration-none"
          >
            {expanded ? "Show less" : `Show ${keys.length - limit} more...`}
          </a>
        </div>
      )}
    </div>
  );
}

export function PropertyValueView({
  value: v,
  isShort,
  namespace,
}: {
  value: PropertyValue;
  isShort?: boolean;
  namespace: string | null;
}) {
  const project = useProject();
  if ("keyValue" in v) {
    let text: string | JSX.Element = keyToString(
      v.keyValue,
      project,
      namespace,
    );
    if (isShort) {
      text = truncate(text, { length: 50 });
    }
    return project === v.keyValue.partitionId.projectId ? (
      <Link
        className={classNames(isShort && "text-truncate")}
        href={`/entities/${encodeKey(v.keyValue)}`}
      >
        <a title={keyToString(v.keyValue, project, namespace)}>{text}</a>
      </Link>
    ) : (
      <span className={classNames(isShort && "text-truncate")}>{text}</span>
    );
  } else if ("stringValue" in v || "blobValue" in v) {
    return (
      <span
        className="d-inline-block text-break"
        style={{ maxWidth: "20em" }}
      >
        {valueToString(v, project, namespace)}
      </span>
    );
  } else if ("arrayValue" in v) {
    return (
      <div>
        {(v.arrayValue.values || []).map((val, i) => (
          <div key={i} className="text-truncate">
            <PropertyValueView
              value={val}
              isShort={isShort}
              namespace={namespace}
            />
          </div>
        ))}
      </div>
    );
  } else if ("entityValue" in v) {
    return (
      <EntityValueView
        properties={v.entityValue}
        namespace={namespace}
      />
    );
  }
  return <span>{valueToString(v, project, namespace)}</span>;
}
