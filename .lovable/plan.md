

## Fix Timeout / Freezing Issues — IMPLEMENTED ✅

### Changes Made

1. **Parallelized Query Rewrite + Expansion** — `rewriteQueryWithHistory` and `expandQuery` now run concurrently via `Promise.all` for multi-turn conversations, saving 1-2s.

2. **Reduced Vector Search Load** — `match_count`: 15→10, `match_threshold`: 0.2→0.25. Faster queries, fewer timeouts.

3. **Timeout Guards on All External Calls**:
   - Rewrite/expansion: 5s (falls back to original query)
   - Embeddings: 8s
   - Keyword search: 8s (race against timeout)
   - Vector search: wrapped in try/catch for graceful degradation
   - Final completion: 60s

4. **Client-Side 90s Timeout** — `AbortController` on the fetch call in `chat-stream.ts`. Shows "Request timed out. Please try again." instead of silently freezing.

All changes use graceful degradation — if any pre-processing step fails/times out, the system continues with whatever data is available.
