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

Keep answers focused, clear, and grounded in the teachings.`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function expandQuery(userQuery: string, apiKey: string): Promise<string> {
  try {
    const res = await fetch(`${OPENAI_URL}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a search query expander for a corpus of spiritual texts by Sri Sri Anandamurti (Prabhat Ranjan Sarkar). Given a user question, output ONLY a single line of expanded search terms — include the original terms plus synonyms, alternative spellings, related Sanskrit/Bengali terms, and key concepts. Do not explain, just output the expanded query string.",
          },
          { role: "user", content: userQuery },
        ],
        temperature: 0,
        max_tokens: 150,
      }),
    });
    if (!res.ok) {
      console.error("Query expansion failed:", res.status);
      return userQuery;
    }
    const data = await res.json();
    const expanded = data.choices?.[0]?.message?.content?.trim();
    console.log("Expanded query:", expanded);
    return expanded || userQuery;
  } catch (e) {
    console.error("Query expansion error:", e);
    return userQuery;
  }
}

async function vectorSearch(
  externalSupabase: ReturnType<typeof createClient>,
  queryEmbedding: number[],
) {
  const { data, error } = await externalSupabase.rpc("match_documents", {
    query_embedding: queryEmbedding,
    match_threshold: 0.2,
    match_count: 12,
  });
  if (error) {
    console.error("Vector search error:", error);
    return [];
  }
  return data || [];
}

async function keywordSearch(
  externalSupabase: ReturnType<typeof createClient>,
  userQuery: string,
) {
  // Extract meaningful words (3+ chars) for keyword search
  const keywords = userQuery
    .toLowerCase()
    .replace(/[?!.,;:'"]/g, "")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !["what", "how", "why", "who", "when", "where", "does", "the", "and", "for", "are", "was", "were", "been", "being", "have", "has", "had", "this", "that", "with", "from", "about", "into"].includes(w));

  if (keywords.length === 0) return [];

  try {
    // Search for each keyword with ilike
    const pattern = keywords.map((k) => `%${k}%`);
    
    // Try searching with the first (most specific) keyword
    const { data, error } = await externalSupabase
      .from("documents")
      .select("id, title, content, doc_id")
      .or(pattern.map((p) => `content.ilike.${p}`).join(","))
      .limit(10);

    if (error) {
      console.error("Keyword search error:", error);
      return [];
    }
    console.log(`Keyword search found ${data?.length || 0} results for: ${keywords.join(", ")}`);
    return (data || []).map((doc) => ({ ...doc, similarity: 0, source: "keyword" as const }));
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
  const MAX_RESULTS = 8;
  const MAX_CONTENT_LENGTH = 1500;

  // Vector results first (they have similarity scores)
  for (const doc of vectorResults) {
    if (merged.length >= MAX_RESULTS) break;
    const key = doc.id || `${doc.title}::${doc.content?.slice(0, 100)}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push({ ...doc, content: doc.content?.slice(0, MAX_CONTENT_LENGTH) || "" });
    }
  }

  // Then keyword results
  for (const doc of keywordResults) {
    if (merged.length >= MAX_RESULTS) break;
    const key = doc.id || `${doc.title}::${doc.content?.slice(0, 100)}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push({ ...doc, similarity: 0, content: doc.content?.slice(0, MAX_CONTENT_LENGTH) || "" });
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

    // Step 1: Expand query for better retrieval
    const expandedQuery = await expandQuery(userQuery, OPENAI_API_KEY);

    // Step 2: Generate embedding from expanded query
    const embeddingResponse = await fetch(`${OPENAI_URL}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: expandedQuery,
      }),
    });

    if (!embeddingResponse.ok) {
      const errText = await embeddingResponse.text();
      console.error("Embedding error:", embeddingResponse.status, errText);
      throw new Error(`Failed to generate query embedding`);
    }

    const embeddingData = await embeddingResponse.json();
    const queryEmbedding = embeddingData.data[0].embedding;

    // Step 3: Hybrid search — vector + keyword in parallel
    const [vectorResults, keywordResults] = await Promise.all([
      vectorSearch(externalSupabase, queryEmbedding),
      keywordSearch(externalSupabase, userQuery),
    ]);

    console.log(`Vector: ${vectorResults.length} results, Keyword: ${keywordResults.length} results`);

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
          `[Source: "${doc.title || "Unknown"}" | Ref: ${doc.doc_id || "N/A"}]\n${doc.content}`,
      )
      .join("\n\n---\n\n");

    const sources = matchedDocs.map((doc: any) => ({
      title: doc.title || "Unknown Source",
      reference: doc.doc_id || "",
    }));

    // Deduplicate sources by title
    const uniqueSources = sources.filter(
      (s: { title: string }, i: number, arr: { title: string }[]) =>
        arr.findIndex((x) => x.title === s.title) === i,
    );

    // Step 5: Generate answer with OpenAI (streaming)
    const chatMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Context passages from Baba's writings:\n\n${context}\n\n---\n\nUser question: ${userQuery}`,
      },
    ];

    // Include conversation history if provided
    if (messages && messages.length > 1) {
      const history = messages.slice(0, -1).map((m: { role: string; content: string }) => ({
        role: m.role,
        content: m.content,
      }));
      chatMessages.splice(1, 0, ...history);
    }

    const completionResponse = await fetch(`${OPENAI_URL}/chat/completions`, {
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
        max_tokens: 1500,
      }),
    });

    if (!completionResponse.ok) {
      const errText = await completionResponse.text();
      console.error("Chat completion error:", errText);
      throw new Error("Failed to generate answer");
    }

    // Stream the response — send initial metadata with answerType TBD,
    // then stream tokens. The frontend will parse ANSWER_TYPE from the text.
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const reader = completionResponse.body!.getReader();
    let fullText = "";

    const stream = new ReadableStream({
      async start(controller) {
        // Send sources metadata first (answerType will be determined from stream content)
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "metadata", sources: uniqueSources, answerType: "inferred", topSimilarity: 0 })}\n\n`,
          ),
        );

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            // Parse answer type from accumulated text and send update
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

          // Parse chunk to accumulate full text for answer type detection
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
