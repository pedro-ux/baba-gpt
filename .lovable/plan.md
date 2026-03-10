

## Fix Timeout / Freezing Issues

The edge function makes multiple sequential API calls (5-10+ seconds) before streaming starts. If any call is slow, the whole request hangs and the client has no timeout — so the UI just freezes silently.

### Changes

#### 1. Parallelize Query Rewrite + Expansion
**File: `supabase/functions/chat/index.ts` (lines 265-272)**
Run `rewriteQueryWithHistory` and `expandQuery` concurrently with `Promise.all` instead of sequentially. Saves 1-2 seconds.

#### 2. Reduce Vector Search Load
**File: `supabase/functions/chat/index.ts` (lines 123-127)**
- `match_count`: 15 → 10
- `match_threshold`: 0.2 → 0.25

Still yields up to 20 unique results across both passes, but runs faster and avoids database statement timeouts.

#### 3. Add Timeout Guards to All External Calls
**File: `supabase/functions/chat/index.ts`**
Wrap every fetch/RPC call with `AbortController` timeouts:
- Rewrite/expansion: 5s (fall back to original query on timeout)
- Embeddings: 8s
- Vector/keyword search: 8s (proceed with partial results)
- Final completion: 60s

Graceful degradation — if a pre-processing step fails, skip it rather than failing the whole request.

#### 4. Add Client-Side Timeout
**File: `src/lib/chat-stream.ts` (line 30)**
Add 90-second `AbortController` on the fetch call. On timeout, call `onError("Request timed out. Please try again.")` so the UI shows feedback instead of freezing.

### No database or frontend UI changes needed.

