import React from "react";
import EntitiesTable from "./EntitiesTable";
import { useGQLQuery } from "./api";
import ErrorMessage from "./ui/ErrorMessage";
import Loading from "./ui/Loading";
import * as qs from "querystringify";
import { useLocation } from "wouter";
import QuestionCircle from "./ui/icons/question-circle";
import useDocumentTitle from "./ui/useDocumentTitle";
import TrashIcon from "./ui/icons/trash";

function RecentQueries({ onSelectQuery }: { onSelectQuery: (query: string) => void }) {
  const [queries, setQueries] = React.useState<string[]>([]);

  React.useEffect(() => {
    const stored = localStorage.getItem("queryHistory");
    if (stored) {
      try {
        setQueries(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to parse query history", e);
      }
    }
  }, []);

  const deleteQuery = React.useCallback((queryToDelete: string) => {
    const updatedQueries = queries.filter(q => q !== queryToDelete);
    setQueries(updatedQueries);
    localStorage.setItem("queryHistory", JSON.stringify(updatedQueries));
  }, [queries]);

  if (queries.length === 0) return null;

  return (
    <div className="mt-4">
      <h5>Recent Queries</h5>
      <ul className="list-group">
        {queries.slice(-100).reverse().map((q, i) => (
          <li key={i} className="list-group-item list-group-item-action d-flex justify-content-between align-items-center" 
              style={{ cursor: 'pointer' }}>
            <span onClick={() => onSelectQuery(q)} className="flex-grow-1">
              {q}
            </span>
            <button 
              className="btn btn-sm btn-outline-danger ms-2" 
              onClick={(e) => {
                e.stopPropagation();
                deleteQuery(q);
              }}
              title="Delete query"
            >
              <TrashIcon className="bi" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function QueryInput({
  initialQuery,
  onRunQuery,
}: {
  initialQuery: string;
  onRunQuery: (q: string) => void;
}) {
  const [query, setQuery] = React.useState(initialQuery);

  // Update query state when initialQuery changes
  React.useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  const updateQuery = React.useCallback((ev) => {
    setQuery(ev.target.value);
  }, []);

  const runQuery = React.useCallback(
    (ev) => {
      ev.preventDefault();
      onRunQuery(query);
    },
    [onRunQuery, query],
  );

  return (
    <form className="mb-3">
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
          autoFocus={true}
          className="form-control"
          rows={5}
          value={query}
          onChange={updateQuery}
        />
      </div>
      <button type="submit" className="btn btn-primary" onClick={runQuery}>
        Run Query
      </button>
    </form>
  );
}

export default function QueryPage({ namespace }: { namespace: string | null }) {
  const q = qs.parse(window.location.search) as Record<string, string>;
  const currentQuery = q.q || "";

  useDocumentTitle("Query");
  const [, setLocation] = useLocation();

  const {
    data: queryResults,
    error,
    isLoading,
  } = useGQLQuery(currentQuery, namespace);

  // Store query in history when results are successfully received
  React.useEffect(() => {
    if (queryResults && currentQuery.trim()) {
      const stored = localStorage.getItem("queryHistory");
      let queries: string[] = [];
      try {
        queries = stored ? JSON.parse(stored) : [];
      } catch (e) {
        console.error("Failed to parse query history", e);
      }
      
      // Remove duplicate if exists and add new query
      queries = queries.filter(q => q !== currentQuery);
      queries.push(currentQuery);
      
      // Keep only last 100 queries
      if (queries.length > 100) {
        queries = queries.slice(-100);
      }
      
      localStorage.setItem("queryHistory", JSON.stringify(queries));
    }
  }, [queryResults, currentQuery]);

  const runQuery = React.useCallback(
    (query: string) => {
      setLocation(
        window.location.pathname +
          "?" +
          qs.stringify({
            ...q,
            q: query,
          }),
      );
    },
    [q, setLocation],
  );

  return (
    <div>
      <QueryInput initialQuery={currentQuery} onRunQuery={runQuery} />
      {error != null ? <ErrorMessage error={error} /> : null}
      {isLoading ? (
        <Loading />
      ) : queryResults != null ? (
        <EntitiesTable entities={queryResults} namespace={namespace} />
      ) : (
        <RecentQueries onSelectQuery={runQuery} />
      )}
    </div>
  );
}
