import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const externalUrl = Deno.env.get("EXTERNAL_SUPABASE_URL");
    const externalKey = Deno.env.get("EXTERNAL_SUPABASE_KEY");

    if (!externalUrl || !externalKey) {
      throw new Error("External Supabase credentials not configured");
    }

    const supabase = createClient(externalUrl, externalKey);

    // Query the information schema to see what tables exist
    const { data, error } = await supabase.rpc("get_tables_info").select("*");
    
    // Fallback: try querying common RAG table names
    const tables: Record<string, unknown> = {};
    
    for (const tableName of ["documents", "chunks", "embeddings", "document_chunks", "content", "passages", "sections"]) {
      const { data: tableData, error: tableError } = await supabase
        .from(tableName)
        .select("*")
        .limit(1);
      
      if (!tableError && tableData) {
        tables[tableName] = {
          exists: true,
          sample: tableData[0] || null,
          columns: tableData[0] ? Object.keys(tableData[0]) : [],
        };
      }
    }

    return new Response(JSON.stringify({ tables }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("explore error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
