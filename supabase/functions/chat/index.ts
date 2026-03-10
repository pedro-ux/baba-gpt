import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OPENAI_URL = "https://api.openai.com/v1";

const SYSTEM_PROMPT = `You are Baba GPT — a respectful, knowledgeable assistant that answers questions based on the writings and teachings of Sri Sri Anandamurti (Baba).

CRITICAL RULES:
1. CAREFULLY read ALL provided context passages. Look for ANY mention of the queried concept or closely related terms — even partial mentions, synonyms, or alternative spellings (e.g., "dharmacakra" / "dharma chakra" / "dharma cakra").
2. If ANY passage mentions or discusses the topic, treat it as relevant and use it to answer. Quote Baba's own words wherever possible.
3. Only say you cannot find relevant information if NONE of the provided passages contain any mention of the concept or related ideas.
4. When answering, be transparent: distinguish between direct quotes/teachings and your synthesis of multiple passages.
5. Respond in a calm, reverent tone that honors Baba's stature as a spiritual teacher.
6. Format your response clearly. Use bold for key concepts, quotes in blockquotes, and numbered/bulleted lists for clarity.
7. ALWAYS cite sources by their EXACT title as provided in the context passages (e.g., "Ananda Marga Philosophy in a Nutshell", "Subháśita Saḿgraha Part 4"). NEVER refer to sources as "Passage 1", "Passage 2", etc.
8. When making a specific claim or quoting, include the source title inline, e.g.: As Baba explains in **Ananda Marga Philosophy in a Nutshell**: ...
9. At the end of your response, on a NEW line, output a classification tag in this exact format (no other text on that line):
   ANSWER_TYPE: DIRECT
   or
   ANSWER_TYPE: INFERRED
   Use DIRECT if the passages contain clear, relevant information about the question. Use INFERRED only if you had to significantly extrapolate beyond what the passages say.
10. After the ANSWER_TYPE line, list the sources in this exact format, using the actual title and reference from the provided passages:
   SOURCES:
   - [Exact Title from passage] — [Reference/doc_id from passage]
11. Provide THOROUGH, COMPREHENSIVE answers. Cover ALL relevant aspects of the topic found in the passages. Do NOT summarize briefly when detailed explanation is available in the source material. Use multiple quotes from different passages to build a complete picture. If a concept has multiple dimensions (definition, practice, philosophy, context), address each one.

Keep answers grounded in the teachings.`;

// ---------------------------------------------------------------------------
// Timeout helper
// ---------------------------------------------------------------------------

function fetchWithTimeout(
  url: string,
  opts: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...opts, signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  );
}

async function fetchWithRetry(
  url: string,
  opts: RequestInit,
  timeoutMs: number,
  maxRetries = 3,
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetchWithTimeout(url, opts, timeoutMs);
    if (res.status === 429 && attempt < maxRetries) {
      const retryAfter = parseInt(res.headers.get("retry-after") || "0", 10);
      const delay = Math.max(retryAfter * 1000, 1000 * Math.pow(2, attempt));
      console.log(`Rate limited (429), retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }
    return res;
  }
  return fetchWithTimeout(url, opts, timeoutMs);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function rewriteQueryWithHistory(
  messages: { role: string; content: string }[],
  latestQuery: string,
  apiKey: string,
): Promise<string> {
  try {
    const historyText = messages
      .slice(0, -1)
      .map((m) => `${m.role}: ${m.content}`)
      .slice(-6)
      .join("\n");

    const res = await fetchWithRetry(
      `${OPENAI_URL}/chat/completions`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                "You are a search query rewriter. Given a conversation history and the user's latest message, rewrite the latest message into a STANDALONE search query that captures the full intent including context from prior messages. Output ONLY the rewritten query, nothing else.",
            },
            {
              role: "user",
              content: `Conversation history:\n${historyText}\n\nLatest message: ${latestQuery}\n\nRewrite this into a standalone search query:`,
            },
          ],
          temperature: 0,
          max_tokens: 150,
        }),
      },
      5000, // 5s timeout
    );
    if (!res.ok) {
      console.error("Query rewrite failed:", res.status);
      return latestQuery;
    }
    const data = await res.json();
    const rewritten = data.choices?.[0]?.message?.content?.trim();
    console.log("Rewritten query:", rewritten);
    return rewritten || latestQuery;
  } catch (e) {
    console.error("Query rewrite error (timeout or network):", e);
    return latestQuery; // graceful fallback
  }
}

async function expandQuery(userQuery: string, apiKey: string): Promise<string> {
  try {
    const res = await fetchWithRetry(
      `${OPENAI_URL}/chat/completions`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                "You are a search query expander for a corpus of spiritual texts by Sri Sri Anandamurti (Prabhat Ranjan Sarkar). Given a user question, output ONLY a single line of at most 8 expanded search terms. Focus on alternative spellings, Sanskrit/Bengali synonyms, and directly related concepts ONLY. Do NOT include generic spiritual terms like God, Liberation, Enlightenment, Moksha, Spirituality, Divine. Keep terms closely tied to the specific concept asked about.",
            },
            { role: "user", content: userQuery },
          ],
          temperature: 0,
          max_tokens: 100,
        }),
      },
      5000, // 5s timeout
    );
    if (!res.ok) {
      console.error("Query expansion failed:", res.status);
      return userQuery;
    }
    const data = await res.json();
    const expanded = data.choices?.[0]?.message?.content?.trim();
    console.log("Expanded query:", expanded);
    return expanded || userQuery;
  } catch (e) {
    console.error("Query expansion error (timeout or network):", e);
    return userQuery; // graceful fallback
  }
}

async function vectorSearch(
  externalSupabase: ReturnType<typeof createClient>,
  queryEmbedding: number[],
) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const { data, error } = await externalSupabase.rpc("match_documents", {
      query_embedding: queryEmbedding,
      match_threshold: 0.25,
      match_count: 10,
    });
    clearTimeout(timer);
    if (error) {
      console.error("Vector search error:", error);
      return [];
    }
    return data || [];
  } catch (e) {
    console.error("Vector search timeout/error:", e);
    return []; // graceful fallback
  }
}

async function keywordSearch(
  externalSupabase: ReturnType<typeof createClient>,
  userQuery: string,
) {
  const keywords = userQuery
    .toLowerCase()
    .replace(/[?!.,;:'"]/g, "")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !["what", "how", "why", "who", "when", "where", "does", "the", "and", "for", "are", "was", "were", "been", "being", "have", "has", "had", "this", "that", "with", "from", "about", "into"].includes(w));

  if (keywords.length === 0) return [];

  try {
    // AND logic: require ALL keywords to match
    let andQuery = externalSupabase
      .from("documents")
      .select("id, discourse_title, content, discourse_id");
    
    for (const k of keywords) {
      andQuery = andQuery.ilike("content", `%${k}%`);
    }
    
    const andPromise = andQuery.limit(10);

    // Phrase search: exact phrase match
    const phrasePattern = `%${keywords.join(" ")}%`;
    const phrasePromise = externalSupabase
      .from("documents")
      .select("id, discourse_title, content, discourse_id")
      .ilike("content", phrasePattern)
      .limit(5);

    // Run both in parallel with a race against timeout
    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), 8000)
    );

    const [andResult, phraseResult] = await Promise.all([
      Promise.race([andPromise, timeoutPromise]),
      Promise.race([phrasePromise, timeoutPromise]),
    ]);

    const andData = andResult && typeof andResult === 'object' && 'data' in andResult ? (andResult as any).data : null;
    const phraseData = phraseResult && typeof phraseResult === 'object' && 'data' in phraseResult ? (phraseResult as any).data : null;

    // Combine and deduplicate
    const seen = new Set<string>();
    const results: any[] = [];
    for (const doc of (phraseData || [])) {
      const key = String(doc.id);
      if (!seen.has(key)) {
        seen.add(key);
        results.push({ ...doc, similarity: 0, source: "keyword" as const });
      }
    }
    for (const doc of (andData || [])) {
      const key = String(doc.id);
      if (!seen.has(key)) {
        seen.add(key);
        results.push({ ...doc, similarity: 0, source: "keyword" as const });
      }
    }

    console.log(`Keyword search found ${results.length} results (phrase: ${phraseData?.length || 0}, AND: ${andData?.length || 0}) for: ${keywords.join(", ")}`);
    return results;
  } catch (e) {
    console.error("Keyword search exception:", e);
    return [];
  }
}

function mergeAndDeduplicate(
  vectorResults: any[],
  keywordResults: any[],
): any[] {
  const seen = new Set<string>();
  const merged: any[] = [];
  const MAX_RESULTS = 12;
  const MAX_CONTENT_LENGTH = 3500;

  const allResults = [
    ...vectorResults.map((doc) => ({ ...doc, similarity: doc.similarity || 0 })),
    ...keywordResults.map((doc) => ({ ...doc, similarity: doc.similarity || 0 })),
  ];

  allResults.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));

  for (const doc of allResults) {
    if (merged.length >= MAX_RESULTS) break;
    const key = doc.id || `${doc.discourse_title}::${doc.content?.slice(0, 100)}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push({ ...doc, content: doc.content?.slice(0, MAX_CONTENT_LENGTH) || "" });
    }
  }

  return merged;
}

function parseAnswerType(fullText: string): "direct" | "inferred" {
  const match = fullText.match(/ANSWER_TYPE:\s*(DIRECT|INFERRED)/i);
  if (match) {
    return match[1].toLowerCase() as "direct" | "inferred";
  }
  return "inferred";
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, messages } = await req.json();
    const userQuery = query || messages?.[messages.length - 1]?.content;

    if (!userQuery) {
      return new Response(JSON.stringify({ error: "No query provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    const EXTERNAL_SUPABASE_URL = Deno.env.get("EXTERNAL_SUPABASE_URL");
    const EXTERNAL_SUPABASE_KEY = Deno.env.get("EXTERNAL_SUPABASE_KEY");

    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");
    if (!EXTERNAL_SUPABASE_URL || !EXTERNAL_SUPABASE_KEY) {
      throw new Error("External database credentials not configured");
    }

    const externalSupabase = createClient(EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_KEY);

    // Step 1: Rewrite + Expand in PARALLEL (saves 1-2s)
    let searchQuery = userQuery;
    let expandedQuery = userQuery;

    if (messages && messages.length > 1) {
      // Multi-turn: rewrite and expand in parallel
      const [rewritten, expanded] = await Promise.all([
        rewriteQueryWithHistory(messages, userQuery, OPENAI_API_KEY),
        expandQuery(userQuery, OPENAI_API_KEY),
      ]);
      searchQuery = rewritten;
      expandedQuery = expanded;
    } else {
      // Single-turn: only expand (no rewrite needed)
      expandedQuery = await expandQuery(searchQuery, OPENAI_API_KEY);
    }

    // Step 2: Generate embeddings for BOTH original and expanded queries
    const [originalEmbeddingRes, expandedEmbeddingRes] = await Promise.all([
      fetchWithTimeout(
        `${OPENAI_URL}/embeddings`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "text-embedding-3-small", input: searchQuery }),
        },
        8000, // 8s timeout
      ),
      fetchWithTimeout(
        `${OPENAI_URL}/embeddings`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "text-embedding-3-small", input: expandedQuery }),
        },
        8000, // 8s timeout
      ),
    ]);

    if (!originalEmbeddingRes.ok || !expandedEmbeddingRes.ok) {
      console.error("Embedding error:", originalEmbeddingRes.status, expandedEmbeddingRes.status);
      throw new Error("Failed to generate query embeddings");
    }

    const [originalEmbData, expandedEmbData] = await Promise.all([
      originalEmbeddingRes.json(),
      expandedEmbeddingRes.json(),
    ]);
    const originalEmbedding = originalEmbData.data[0].embedding;
    const expandedEmbedding = expandedEmbData.data[0].embedding;

    // Step 3: Hybrid search — two vector passes + keyword in parallel
    const [originalVectorResults, expandedVectorResults, keywordResults] = await Promise.all([
      vectorSearch(externalSupabase, originalEmbedding),
      vectorSearch(externalSupabase, expandedEmbedding),
      keywordSearch(externalSupabase, searchQuery),
    ]);

    // Merge both vector result sets (dedup by ID, keep highest similarity)
    const vectorMap = new Map<string, any>();
    for (const doc of [...originalVectorResults, ...expandedVectorResults]) {
      const key = String(doc.id);
      const existing = vectorMap.get(key);
      if (!existing || (doc.similarity || 0) > (existing.similarity || 0)) {
        vectorMap.set(key, doc);
      }
    }
    const vectorResults = Array.from(vectorMap.values());

    console.log(`Vector: ${vectorResults.length} results (orig: ${originalVectorResults.length}, expanded: ${expandedVectorResults.length}), Keyword: ${keywordResults.length} results`);

    const matchedDocs = mergeAndDeduplicate(vectorResults, keywordResults);

    if (matchedDocs.length === 0) {
      return new Response(
        JSON.stringify({
          answer:
            "I could not find relevant passages in Baba's writings for this question. Please try rephrasing or exploring a related topic.",
          sources: [],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Step 4: Build context from matched documents
    const context = matchedDocs
      .map(
        (doc: any) =>
          `[Source: "${doc.discourse_title || "Unknown"}" | Ref: ${doc.discourse_id || "N/A"}]\n${doc.content}`,
      )
      .join("\n\n---\n\n");

    const sources = matchedDocs.map((doc: any) => ({
      title: doc.discourse_title || "Unknown Source",
      reference: doc.discourse_id || "",
    }));

    const uniqueSources = sources.filter(
      (s: { title: string }, i: number, arr: { title: string }[]) =>
        arr.findIndex((x) => x.title === s.title) === i,
    );

    // Step 5: Generate answer with OpenAI (streaming) — 60s timeout
    const chatMessages: { role: string; content: string }[] = [
      { role: "system", content: SYSTEM_PROMPT },
    ];

    if (messages && messages.length > 1) {
      const history = messages.slice(0, -1).map((m: { role: string; content: string }) => ({
        role: m.role,
        content: m.content,
      }));
      chatMessages.push(...history);
    }

    chatMessages.push({
      role: "user",
      content: `Context passages from Baba's writings:\n\n${context}\n\n---\n\nUser question: ${userQuery}`,
    });

    const completionResponse = await fetchWithTimeout(
      `${OPENAI_URL}/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: chatMessages,
          stream: true,
          temperature: 0.3,
          max_tokens: 4000,
        }),
      },
      60000, // 60s timeout for completion
    );

    if (!completionResponse.ok) {
      const errText = await completionResponse.text();
      console.error("Chat completion error:", errText);
      throw new Error("Failed to generate answer");
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const reader = completionResponse.body!.getReader();
    let fullText = "";

    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "metadata", sources: uniqueSources, answerType: "inferred", topSimilarity: 0 })}\n\n`,
          ),
        );

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            const detectedType = parseAnswerType(fullText);
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "answerTypeUpdate", answerType: detectedType })}\n\n`,
              ),
            );
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
            break;
          }

          const chunk = decoder.decode(value, { stream: true });

          for (const line of chunk.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (jsonStr === "[DONE]") continue;
            try {
              const parsed = JSON.parse(jsonStr);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) fullText += content;
            } catch { /* partial */ }
          }

          controller.enqueue(encoder.encode(chunk));
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
