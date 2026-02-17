import React from "react";
import EntitiesTable from "./EntitiesTable";
import { useGQLQuery, useLookupEntities, Key, Entity, useProject } from "./api";
import ErrorMessage from "./ui/ErrorMessage";
import Loading from "./ui/Loading";
import * as qs from "querystringify";
import { useLocation } from "wouter";
import QuestionCircle from "./ui/icons/question-circle";
import useDocumentTitle from "./ui/useDocumentTitle";
import TrashIcon from "./ui/icons/trash";
import ChevronDown from "./ui/icons/chevron-compact-down";
import ChevronUp from "./ui/icons/chevron-compact-up";
import { keyToString } from "./keys";

const DRAFT_QUERY_STORAGE_KEY = "draftQuery";
const QUERY_HISTORY_STORAGE_KEY = "queryHistory";
const MAX_QUERY_HISTORY = 100;

function readQueryHistory(): string[] {
  const stored = localStorage.getItem(QUERY_HISTORY_STORAGE_KEY);
  if (stored == null) {
    return [];
  }
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error("Failed to parse query history", e);
    return [];
  }
}

function writeQueryHistory(queries: string[]) {
  localStorage.setItem(QUERY_HISTORY_STORAGE_KEY, JSON.stringify(queries));
}

function parseJoinProperties(joinProperty: string) {
  return joinProperty
    .split(",")
    .map((property) => property.trim())
    .filter((property) => property.length > 0);
}

function useQueryHistory() {
  const [queries, setQueries] = React.useState<string[]>([]);

  React.useEffect(() => {
    setQueries(readQueryHistory());
  }, []);

  const deleteQuery = React.useCallback((queryToDelete: string) => {
    setQueries((previousQueries) => {
      const updatedQueries = previousQueries.filter((q) => q !== queryToDelete);
      writeQueryHistory(updatedQueries);
      return updatedQueries;
    });
  }, []);

  const storeQuery = React.useCallback((queryToStore: string) => {
    if (queryToStore.trim() === "") {
      return;
    }
    setQueries((previousQueries) => {
      const nextQueries = previousQueries.filter((q) => q !== queryToStore);
      nextQueries.push(queryToStore);
      const compactQueries =
        nextQueries.length > MAX_QUERY_HISTORY
          ? nextQueries.slice(-MAX_QUERY_HISTORY)
          : nextQueries;
      writeQueryHistory(compactQueries);
      return compactQueries;
    });
  }, []);

  return {
    queries,
    deleteQuery,
    storeQuery,
  };
}

function RecentQuery({
  query,
  onSelectQuery,
  deleteQuery,
}: {
  query: string;
  onSelectQuery: (query: string) => void;
  deleteQuery: (query: string) => void;
}) {
  return (
    <>
      <span onClick={() => onSelectQuery(query)} className="flex-grow-1">
        {query}
      </span>
      <button
        type="button"
        className="btn btn-sm btn-outline-danger ms-2"
        onClick={(e) => {
          e.stopPropagation();
          deleteQuery(query);
        }}
        title="Delete query"
      >
        <TrashIcon className="bi" />
      </button>
    </>
  );
}

function RecentQueries({
  query,
  onSelectQuery,
  queries,
  deleteQuery,
}: {
  query: string;
  onSelectQuery: (query: string) => void;
  queries: string[];
  deleteQuery: (query: string) => void;
}) {
  if (queries.length === 0) return null;

  return (
    <div className="mt-4">
      <h5>Recent Queries</h5>
      <ul className="list-group">
        {queries
          .filter((q) => q.toLowerCase().startsWith(query.trim().toLowerCase()))
          .slice(-100)
          .reverse()
          .map((q, i) => (
            <li
              key={`${q}-${i}`}
              className="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
              style={{ cursor: "pointer" }}
            >
              <RecentQuery
                query={q}
                onSelectQuery={onSelectQuery}
                deleteQuery={deleteQuery}
              />
            </li>
          ))}
      </ul>
    </div>
  );
}

function JoinConfig({
  joinProperty,
  setJoinProperty,
}: {
  joinProperty: string;
  setJoinProperty: (v: string) => void;
}) {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <div className="card mb-3">
      <div
        className="card-header bg-light d-flex justify-content-between align-items-center"
        onClick={() => setIsOpen(!isOpen)}
        style={{ cursor: "pointer" }}
      >
        <div className="fw-bold small">Join Optimization (NoSQL Join)</div>
        {isOpen ? <ChevronUp width={16} /> : <ChevronDown width={16} />}
      </div>
      {isOpen && (
        <div className="card-body">
          <div className="mb-2">
            <label className="form-label small text-muted">Join Properties (comma separated)</label>
            <input
              type="text"
              className="form-control form-control-sm"
              placeholder="e.g. ownerKey, creatorKey"
              value={joinProperty}
              onChange={(e) => setJoinProperty(e.target.value)}
            />
            <div className="form-text small">
              For each property, referenced entities will be fetched in batch and joined.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function QueryInput({
  query,
  setQuery,
  onRunQuery,
  joinProperty,
  setJoinProperty,
}: {
  query: string;
  setQuery: (q: string) => void;
  onRunQuery: (q: string) => void;
  joinProperty: string;
  setJoinProperty: (v: string) => void;
}) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Move cursor to end on initial load
  React.useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.selectionStart = textareaRef.current.value.length;
      textareaRef.current.selectionEnd = textareaRef.current.value.length;
    }
  }, []);

  const updateQuery = React.useCallback(
    (ev: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newQuery = ev.target.value;
      setQuery(newQuery);
      // Save draft query to localStorage as user types.
      if (newQuery.trim()) {
        localStorage.setItem(DRAFT_QUERY_STORAGE_KEY, newQuery);
      } else {
        localStorage.removeItem(DRAFT_QUERY_STORAGE_KEY);
      }
    },
    [setQuery],
  );

  const runQuery = React.useCallback(
    (ev: React.MouseEvent<HTMLButtonElement>) => {
      ev.preventDefault();
      // Clear draft query when query is executed
      localStorage.removeItem(DRAFT_QUERY_STORAGE_KEY);
      onRunQuery(query);
    },
    [onRunQuery, query],
  );

  return (
    <div className="mb-3">
      <form className="mb-2">
        <div className="mb-3">
          <label className="form-label">
            GQL Query
            <a
              href="https://cloud.google.com/datastore/docs/reference/gql_reference#grammar"
              rel="noreferrer"
              target="_blank"
            >
              <QuestionCircle className="bi ms-2" />
            </a>
          </label>
          <textarea
            ref={textareaRef}
            autoFocus={true}
            className="form-control"
            rows={5}
            value={query}
            onChange={updateQuery}
          />
        </div>
        <JoinConfig joinProperty={joinProperty} setJoinProperty={setJoinProperty} />
        <button type="submit" className="btn btn-primary" onClick={runQuery}>
          Run Query
        </button>
      </form>
    </div>
  );
}

export default function QueryPage({ namespace }: { namespace: string | null }) {
  const q = qs.parse(window.location.search) as Record<string, string>;
  const currentQuery = q.q || "";
  const currentJoinProperty = q.join || "";

  useDocumentTitle("Query");
  const [, setLocation] = useLocation();
  const project = useProject();
  const { queries, deleteQuery, storeQuery } = useQueryHistory();

  const [query, setQuery] = React.useState(() => {
    const draftQuery = localStorage.getItem(DRAFT_QUERY_STORAGE_KEY);
    return draftQuery ? draftQuery : currentQuery;
  });

  const [joinProperty, setJoinProperty] = React.useState(currentJoinProperty);
  const joinProperties = React.useMemo(
    () => parseJoinProperties(joinProperty),
    [joinProperty],
  );

  const {
    data: queryResults,
    error,
    isLoading,
  } = useGQLQuery(currentQuery, namespace);

  // Calculate keys to join
  const keysToJoin = React.useMemo(() => {
    if (!queryResults || joinProperties.length === 0) return [];
    const keys: Key[] = [];

    for (const e of queryResults) {
      for (const prop of joinProperties) {
        const val = e.properties?.[prop];
        if (val && "keyValue" in val) {
          keys.push(val.keyValue);
        }
      }
    }
    return keys;
  }, [queryResults, joinProperties]);

  const { data: joinedEntities, isLoading: isJoining } = useLookupEntities(keysToJoin);

  // Merge results
  const finalEntities = React.useMemo(() => {
    if (!queryResults) return [];
    if (joinProperties.length === 0 || !joinedEntities) return queryResults;

    const entityMap = new Map<string, Entity>();
    joinedEntities.forEach((e) => {
      // Use keyToString for stable key hash
      const kStr = keyToString(e.key, project, namespace);
      entityMap.set(kStr, e);
    });

    return queryResults.map((e) => {
      const newProperties = { ...e.properties };
      let modified = false;

      for (const prop of joinProperties) {
        const val = e.properties?.[prop];
        if (val && "keyValue" in val) {
          const kStr = keyToString(val.keyValue, project, namespace);
          const joined = entityMap.get(kStr);
          if (joined) {
            newProperties[`${prop}_joined`] = {
              entityValue: joined.properties || {},
            };
            modified = true;
          }
        }
      }

      if (modified) {
        return { ...e, properties: newProperties } as Entity;
      }
      return e;
    });
  }, [queryResults, joinedEntities, joinProperties, project, namespace]);

  // Store query in history when results are successfully received
  React.useEffect(() => {
    if (queryResults && currentQuery.trim()) {
      storeQuery(currentQuery);
    }
  }, [queryResults, currentQuery, storeQuery]);

  const runQuery = React.useCallback(
    (newQuery: string) => {
      setQuery(newQuery);
      setLocation(
        window.location.pathname +
        "?" +
        qs.stringify({
          ...q,
          q: newQuery,
          join: joinProperty || undefined,
        }),
      );
    },
    [q, setLocation, joinProperty],
  );

  const onSelectQuery = React.useCallback(
    (selectedQuery: string) => {
      setQuery(selectedQuery);
    },
    [setQuery],
  );

  return (
    <div>
      <QueryInput
        query={query}
        setQuery={setQuery}
        onRunQuery={runQuery}
        joinProperty={joinProperty}
        setJoinProperty={setJoinProperty}
      />
      {error != null ? <ErrorMessage error={error} /> : null}
      {isLoading ? (
        <Loading />
      ) : queryResults != null ? (
        <>
          {isJoining && <div className="text-muted small mb-2">Joining entities...</div>}
          <EntitiesTable entities={finalEntities} namespace={namespace} />
        </>
      ) : (
        <RecentQueries
          query={query}
          queries={queries}
          onSelectQuery={onSelectQuery}
          deleteQuery={deleteQuery}
        />
      )}
    </div>
  );
}
