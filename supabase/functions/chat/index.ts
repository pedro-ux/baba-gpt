import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OPENAI_URL = "https://api.openai.com/v1";

const SYSTEM_PROMPT = `You are Baba GPT — a respectful, knowledgeable assistant that answers questions based EXCLUSIVELY on the writings and teachings of Sri Sri Anandamurti (Baba).

CRITICAL RULES:
1. Prioritize using the provided context passages to answer. Use Baba's own words and phrasing wherever possible.
2. If the provided passages directly address the question, answer using them and cite the sources.
3. If the passages do NOT directly answer the question but contain related teachings, clearly state: "**There is no direct passage addressing this exact question in the retrieved texts.** However, based on Baba's related teachings, we can infer the following:" — then provide a thoughtful inference grounded in the available evidence and Baba's broader philosophical framework.
4. Always be transparent about what is a direct quote/teaching vs. what is your inference based on his broader philosophy.
5. Respond in a calm, reverent tone that honors Baba's stature as a spiritual teacher.
6. Format your response clearly. Use bold for key concepts, quotes in blockquotes, and numbered/bulleted lists for clarity.
7. At the end of your response, list the sources in this exact format:
   SOURCES:
   - [Title] — [Reference/Section]

Keep answers focused, clear, and grounded in the teachings.`;

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

    // Step 1: Generate embedding for the user's query
    const embeddingResponse = await fetch(`${OPENAI_URL}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: userQuery,
      }),
    });

    if (!embeddingResponse.ok) {
      const errText = await embeddingResponse.text();
      console.error("Embedding error:", embeddingResponse.status, errText);
      throw new Error(`Failed to generate query embedding: ${embeddingResponse.status} ${errText}`);
    }

    const embeddingData = await embeddingResponse.json();
    const queryEmbedding = embeddingData.data[0].embedding;

    // Step 2: Vector similarity search on external Supabase
    const externalSupabase = createClient(EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_KEY);

    const { data: matchedDocs, error: matchError } = await externalSupabase.rpc(
      "match_documents",
      {
        query_embedding: queryEmbedding,
        match_threshold: 0.3,
        match_count: 6,
      }
    );

    if (matchError) {
      console.error("Vector search error:", matchError);
      throw new Error(`Vector search failed: ${matchError.message}`);
    }

    if (!matchedDocs || matchedDocs.length === 0) {
      return new Response(
        JSON.stringify({
          answer:
            "I could not find relevant passages in Baba's writings for this question. Please try rephrasing or exploring a related topic.",
          sources: [],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 3: Build context from matched documents
    const context = matchedDocs
      .map(
        (doc: { title: string; content: string; similarity: number }, i: number) =>
          `[Passage ${i + 1}] (Source: ${doc.title}, Similarity: ${doc.similarity.toFixed(3)})\n${doc.content}`
      )
      .join("\n\n---\n\n");

    const sources = matchedDocs.map((doc: { title: string; doc_id: string }) => ({
      title: doc.title || "Unknown Source",
      reference: doc.doc_id || "",
    }));

    // Deduplicate sources by title
    const uniqueSources = sources.filter(
      (s: { title: string }, i: number, arr: { title: string }[]) =>
        arr.findIndex((x) => x.title === s.title) === i
    );

    // Step 4: Generate answer with OpenAI (streaming)
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

    // Stream the response back with sources appended at the end
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const reader = completionResponse.body!.getReader();

    const stream = new ReadableStream({
      async start(controller) {
        // Send sources as a custom SSE event first
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "sources", sources: uniqueSources })}\n\n`)
        );

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
            break;
          }

          const chunk = decoder.decode(value, { stream: true });
          // Forward the SSE data directly
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
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
