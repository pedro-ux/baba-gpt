

## Improve Retrieval Quality for Broad Concepts

### Problem
For well-known concepts like "Taraka Brahma", the system retrieves 22 raw results but the final answer is unsatisfactory because:
- Keyword search matches "taraka" OR "brahma" separately, pulling in unrelated passages about Brahma alone
- Query expansion generates overly broad terms ("God", "Moksha", "Spirituality") that dilute vector search quality
- Content is truncated to 1500 characters, cutting off explanations mid-thought
- Only 8 passages are sent to the LLM, limiting coverage of a multi-faceted topic
- Keyword results have no relevance ranking -- arbitrary database order

### Changes

### 1. Smarter Keyword Search (AND logic + phrase matching)
Change keyword search to require ALL significant terms match (AND instead of OR). Also add a separate phrase search for the exact query string.

Example for "taraka brahma":
- Current: matches docs with "taraka" OR "brahma" (too broad)
- Proposed: matches docs with "taraka" AND "brahma", plus a phrase search for "taraka brahma"

### 2. Constrain Query Expansion
Update the query expansion prompt to produce fewer, more targeted terms (max 5-8 terms) and avoid overly generic spiritual terms. Focus on alternative spellings and closely related Sanskrit concepts only.

### 3. Increase Context Window
- Raise `MAX_CONTENT_LENGTH` from 1500 to 2500 characters per passage
- Raise `MAX_RESULTS` from 8 to 10 passages
- This gives the LLM substantially more material to work with

### 4. Prioritize Vector Results with Re-ranking
Sort merged results by vector similarity score so the most semantically relevant passages appear first. Keyword-only results (similarity = 0) go last as supplementary context.

### 5. Two-Pass Embedding Strategy
Generate embeddings for both the original query AND the expanded query, then combine vector results from both. This prevents expansion drift -- the original "taraka brahma" embedding stays pure while the expanded one catches related concepts.

---

### Technical Details

**File: `supabase/functions/chat/index.ts`**

**Keyword search function (lines 134-165)**
- Change `.or()` to use AND logic: filter rows where content matches ALL keywords
- Add a separate phrase-match query for the exact user query string
- Combine both result sets

**Query expansion prompt (lines 85-115)**
- Revise system prompt to: "Output at most 8 expanded terms. Focus on alternative spellings, Sanskrit synonyms, and directly related concepts only. Do NOT include generic spiritual terms like God, Liberation, Enlightenment."

**Merge function (lines 167-195)**
- Increase `MAX_RESULTS` from 8 to 10
- Increase `MAX_CONTENT_LENGTH` from 1500 to 2500
- Sort final merged array by similarity score descending before returning

**Embedding generation (around lines 250-270)**
- Generate two embeddings: one for the original/rewritten query, one for the expanded query
- Run two parallel vector searches
- Merge both result sets (dedup by doc ID) before combining with keyword results

### No database or frontend changes needed.
