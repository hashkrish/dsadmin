import classNames from "classnames";
import React from "react";
import { Link } from "wouter";
import { encodeKey, PropertyValue, useProject } from "./api";
import { keyToString } from "./keys";

export enum ValueType {
  Null,
  Timestamp,
  String,
  Key,
  Boolean,
  Integer,
  Double,
  GeoPoint,
  Array,
  Blob,
  Entity,
}

export function truncate(str: string, n: number) {
  return str.length > n ? (
    <React.Fragment>{str.substr(0, n - 1)}&hellip;</React.Fragment>
  ) : (
    <React.Fragment>{str}</React.Fragment>
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
    const text = keyToString(v.keyValue, project, namespace);
    return project === v.keyValue.partitionId.projectId ? (
      <Link
        className={classNames(isShort && "text-truncate")}
        href={`/entities/${encodeKey(v.keyValue)}`}
      >
        {text}
      </Link>
    ) : (
      <span className={classNames(isShort && "text-truncate")}>{text}</span>
    );
  } else if ("stringValue" in v) {
    return (
      <span
        className="d-inline-block text-truncate"
        style={{ maxWidth: "10em" }}
      >
        {valueToString(v, project, namespace)}
      </span>
    );
  }
  return (
    <span className="text-nowrap">{valueToString(v, project, namespace)}</span>
  );
}

export function valueToString(
  v: PropertyValue,
  project: string,
  namespace: string | null,
): string {
  if ("timestampValue" in v) {
    return new Date(v.timestampValue).toLocaleString();
  } else if ("stringValue" in v) {
    return v.stringValue;
  } else if ("keyValue" in v) {
    return keyToString(v.keyValue, project, namespace);
  } else if ("nullValue" in v) {
    return "null";
  } else if ("booleanValue" in v) {
    return v.booleanValue + "";
  } else if ("integerValue" in v) {
    return v.integerValue;
  } else if ("doubleValue" in v) {
    return v.doubleValue + "";
  } else if ("geoPointValue" in v) {
    return `lat: ${v.geoPointValue.latitude}, lon: ${v.geoPointValue.longitude}`;
  } else if ("arrayValue" in v) {
    return (
      "[" +
      (v.arrayValue.values || [])
        .map((v) => valueToString(v, project, namespace))
        .join(", ") +
      "]"
    );
  } else if ("blobValue" in v) {
    return `blob (${atob(v.blobValue).length} bytes)`;
  }
  return JSON.stringify(v);
}

export function isValueEqual(a: PropertyValue, b: PropertyValue): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function valueType(v: PropertyValue): ValueType {
  if ("timestampValue" in v) {
    return ValueType.Timestamp;
  } else if ("stringValue" in v) {
    return ValueType.String;
  } else if ("keyValue" in v) {
    return ValueType.Key;
  } else if ("nullValue" in v) {
    return ValueType.Null;
  } else if ("booleanValue" in v) {
    return ValueType.Boolean;
  } else if ("integerValue" in v) {
    return ValueType.Integer;
  } else if ("doubleValue" in v) {
    return ValueType.Double;
  } else if ("geoPointValue" in v) {
    return ValueType.GeoPoint;
  } else if ("arrayValue" in v) {
    return ValueType.Array;
  } else if ("blobValue" in v) {
    return ValueType.Blob;
  } else if ("entityValue" in v) {
    return ValueType.Entity;
  }
  throw new Error("Unknown type");
}
