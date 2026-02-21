

## Problem

The context sent to GPT-4o labels each document as `[Passage 1]`, `[Passage 2]`, etc. The LLM then cites these labels instead of the actual book or discourse title. The system prompt does not instruct the LLM to use real source names.

## Solution

Two changes in `supabase/functions/chat/index.ts`:

### 1. Relabel context passages with actual titles

Change the context builder (line 239-243) from:

```
[Passage 1] (Source: Some Book Title, Similarity: 0.8)
```

to:

```
[Source: "Some Book Title" | Ref: doc_id_123]
```

Remove the generic "Passage N" numbering entirely so the LLM has no choice but to cite the real title.

### 2. Add explicit citation rules to the system prompt

Add to the SYSTEM_PROMPT (around line 12-30):

- "ALWAYS cite sources by their exact title as provided in the context (e.g., 'Ananda Marga Philosophy in a Nutshell'). NEVER refer to sources as 'Passage 1', 'Passage 2', etc."
- "When making a specific claim or quoting, include the source title inline, e.g.: As Baba explains in **Ananda Marga Philosophy in a Nutshell**: ..."
- Update the SOURCES format instruction to use the actual title and doc_id/reference from the passages.

### Files to modify

- `supabase/functions/chat/index.ts` -- context builder + system prompt

No frontend changes needed since the source badges already display `source.title` and `source.reference`.

