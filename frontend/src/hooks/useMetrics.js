import { useState, useEffect } from 'react';
import { getMetrics } from '../utils/api.js';

/**
 * Debounced metrics fetcher. Cancels in-flight requests when filters change.
 * Returns { data, loading, error }.
 */
export function useMetrics(repoId, filters) {
  const [state, setState] = useState({ data: null, loading: Boolean(repoId), error: null });
  const filtersKey = JSON.stringify(filters);

  useEffect(() => {
    if (!repoId) {
      setState({ data: null, loading: false, error: null });
      return;
    }

    const controller = new AbortController();
    let timerId;

    const run = async () => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const params = {};
        if (filters.since != null) params.since = filters.since;
        if (filters.until != null) params.until = filters.until;
        if (filters.commitHashes && filters.commitHashes.length > 0)
          params.commits = filters.commitHashes.join(',');
        if (filters.author) params.author = filters.author;
        if (filters.path) params.path = filters.path;
        params.view = filters.view || 'repo';

        const data = await getMetrics(repoId, params, controller.signal);
        setState({ data, loading: false, error: null });
      } catch (err) {
        // Ignore aborts — a new request is already on the way.
        if (err.name === 'CanceledError' || err.name === 'AbortError') return;
        setState({
          data: null,
          loading: false,
          error: err.response?.data?.error || err.message,
        });
      }
    };

    timerId = setTimeout(run, 300);
    return () => {
      clearTimeout(timerId);
      controller.abort();
    };
  // filtersKey captures every filter field; repoId triggers a hard refresh.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoId, filtersKey]);

  return state;
}
