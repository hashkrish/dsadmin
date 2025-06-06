import classNames from "classnames";
import React from "react";
import { Link } from "wouter";
import truncate from "lodash/truncate";
import { PropertyValue, useProject } from "./api";
import { encodeKey, keyToString } from "./keys";
import { valueToString } from "./properties";

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
        <a>{text}</a>
      </Link>
    ) : (
      <span className={classNames(isShort && "text-truncate")}>{text}</span>
    );
  } else if ("stringValue" in v || "blobValue" in v) {
    return (
      <span
        className="d-inline-block text-truncate"
        style={{ maxWidth: "10em" }}
      >
        {valueToString(v, project, namespace)}
      </span>
    );
  } else if ("arrayValue" in v) {
    return (
      <div>
        {(v.arrayValue.values || []).map((v, i) => (
          <div key={i} className="text-truncate">
            {valueToString(v, project, namespace)}
          </div>
        ))}
      </div>
    );
  }
  return <span>{valueToString(v, project, namespace)}</span>;
}
