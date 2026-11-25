/*
 * Live data hooks. Screens render from listeners (IMPLEMENTATION_NOTES: never trust a cache read right after a write).
 * `key` must change whenever the query changes (pass JSON of the query parts).
 */
export function useQuery(adapter, col, query, key = '') {
  const [state, setState] = React.useState({ rows: null, error: null });
  React.useEffect(() => {
    if (query === null) { setState({ rows: [], error: null }); return undefined; } // nothing to load
    setState({ rows: null, error: null });
    let off = () => {};
    try {
      off = adapter.subscribe(col, query, (rows) => setState({ rows, error: null }), (error) => setState({ rows: [], error }));
    } catch (error) { setState({ rows: [], error }); }
    return () => off();
  }, [adapter, col, key]);
  return state;
}

export function useDoc(adapter, col, id) {
  const [state, setState] = React.useState({ doc: undefined, error: null });
  React.useEffect(() => {
    setState({ doc: undefined, error: null });
    const off = adapter.subscribeDoc(col, id, (doc) => setState({ doc, error: null }), (error) => setState({ doc: null, error }));
    return () => off();
  }, [adapter, col, id]);
  return state;
}

/** The signed-in user as an actor for services and the activity log. */
export const actorOf = (user) => ({ uid: user.uid, displayName: user.displayName || user.username });

/** Map an error to a user-facing sentence. */
export function errorMessage(err) {
  if (!err) return '';
  if (err.name === 'DomainError') return err.message;
  if (err.code === 'permission-denied') return 'You do not have permission to do this. The database rules may need to be published (see FIREBASE_SETUP).';
  if (err.code === 'unavailable') return 'The database cannot be reached. Check your connection and try again.';
  if (err.code === 'failed-precondition') return 'The database needs an index for this list. Publish firestore.indexes.json (see FIREBASE_SETUP).';
  return 'Something went wrong. Check your connection and try again.';
}
