

## Improve Conversation Quality and Multi-Turn Retrieval

### Problem
When you ask "talk to me about guru puja" and then follow up with "what about the ideation?", the system only searches for "ideation" -- losing the guru puja context entirely. Additionally, the raw SOURCES block from GPT leaks into the displayed answer.

### Changes

### 1. Context-Aware Query Rewriting (Edge Function)
Before retrieving documents, use the conversation history to rewrite the user's latest message into a standalone query.

Example:
- Turn 1: "talk to me about guru puja"
- Turn 2: "what about the ideation?"
- Rewritten query for retrieval: "guru puja ideation and mental process during guru puja"

This uses a cheap GPT-4o-mini call (already used for query expansion) to produce a self-contained search query from the conversation context.

### 2. Fix Message Ordering in Chat Completion
Currently, conversation history is spliced between the system prompt and the context+question message, which can confuse the model. Reorder to: system prompt, then history, then context + latest question -- ensuring the retrieved passages are always immediately before the answer.

### 3. Strip SOURCES Block from Streamed Output
The SOURCES block (e.g., "SOURCES:\n- Book Title -- ref123") currently leaks into the visible answer. Add filtering in `chat-stream.ts` to strip it, similar to how ANSWER_TYPE is already stripped.

### 4. Increase Max Tokens for Richer Answers
Raise `max_tokens` from 1500 to 2500 so the model can provide more thorough, well-cited responses for broad topics like guru puja.

---

### Technical Details

**File: `supabase/functions/chat/index.ts`**

- Add a `rewriteQueryWithHistory()` function that takes conversation history + latest message and produces a standalone query using GPT-4o-mini
- Call it before `expandQuery()` when conversation history exists (messages.length > 1)
- Fix `chatMessages` construction: place history before the context message (current splice logic is correct but the context message should always be last)
- Increase `max_tokens` from 1500 to 2500

**File: `src/lib/chat-stream.ts`**

- Add regex to strip the SOURCES block from streamed deltas (lines starting with "SOURCES:" and subsequent "- " lines)
- Apply same cleaning in the final flush section

**File: `src/components/ChatMessage.tsx`**

- Update `stripSourcesBlock()` to also catch and remove the SOURCES metadata block from rendered messages

### No database changes needed.
