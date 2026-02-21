

## Problem Diagnosis

The issue has two layers:

1. **Retrieval quality**: The vector search (`match_documents`) returns passages that score ~0.5 similarity but are topically irrelevant (e.g., returning geography passages for a question about "dharmacakra"). This means either the embeddings aren't capturing the right semantics, or the chunking in your external database is too coarse.

2. **System prompt rigidity**: The current prompt tells the LLM to say "no direct passage" if the context doesn't directly answer the question. Even when partially relevant passages exist, the LLM defaults to the "inferred" path too aggressively.

## Proposed Fixes (3 strategies)

### Strategy 1: Query Enhancement (High Impact)

Rewrite the user's query before generating the embedding to improve retrieval. For example, "What is dharmacakra?" becomes a richer search query that matches how the content is actually written in Baba's books.

- Add a lightweight LLM call before the embedding step that expands the query with related Sanskrit/spiritual terms
- Example: "What is dharmacakra?" becomes "dharmacakra dharma chakra collective meditation spiritual gathering kiirtan"
- This helps the embedding model find passages that use different phrasings for the same concept

### Strategy 2: Increase Retrieval and Let the LLM Filter (Medium Impact)

- Increase `match_count` from 6 to 12-15 to cast a wider net
- Lower `match_threshold` from 0.3 to 0.2
- Add a keyword-based fallback: if the user's query contains a specific term (like "dharmacakra"), do a simple text search (`ilike` or full-text search) on the documents table as a secondary retrieval method, then merge results with vector search
- This hybrid approach (vector + keyword) catches exact term matches that embeddings might miss

### Strategy 3: Revise the System Prompt (Medium Impact)

The current prompt is too eager to declare "no direct passage." Revise it to:

- Instruct the LLM to look for ANY mention of the queried concept in the passages, even partial
- Remove the rigid "no direct passage" template language — instead let the LLM naturally answer from whatever context is available
- Add an explicit instruction: "If the user asks about a specific concept (e.g., 'dharmacakra'), search the provided passages for ANY mention of that term or closely related terms before concluding there is no relevant passage"
- Lower the "direct" vs "inferred" threshold or let the LLM itself decide the classification based on content relevance rather than a numeric cutoff

## Implementation Details

### Files to modify:

**`supabase/functions/chat/index.ts`**:
1. Add a query expansion step using a fast GPT call before embedding
2. Increase `match_count` to 12
3. Lower `match_threshold` to 0.2
4. Add a keyword fallback search (text `ilike` query on the documents table in the external Supabase)
5. Merge and deduplicate results from both vector and keyword searches
6. Revise the `SYSTEM_PROMPT` to be less rigid about "no direct passage"
7. Let the LLM classify direct vs inferred instead of using a numeric similarity cutoff — pass a classification instruction in the prompt and parse the response

### Rough flow after changes:

```text
User query
    |
    v
[Query Expansion via fast LLM call]
    |
    v
[Generate embedding from expanded query]
    |
    +---> Vector search (threshold: 0.2, count: 12)
    |
    +---> Keyword/text search (ilike '%dharmacakra%')
    |
    v
[Merge + deduplicate results]
    |
    v
[Send to GPT-4o with revised prompt]
    |
    v
[Stream response with LLM-determined answer type]
```

No frontend changes needed — the `answerType` metadata format stays the same.

