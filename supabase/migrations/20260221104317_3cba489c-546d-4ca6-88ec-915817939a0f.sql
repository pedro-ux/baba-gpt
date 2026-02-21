
CREATE TABLE public.shared_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'Shared conversation',
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.shared_conversations ENABLE ROW LEVEL SECURITY;

-- Anyone can view shared conversations (that's the point of sharing)
CREATE POLICY "Shared conversations are publicly readable"
  ON public.shared_conversations FOR SELECT
  USING (true);

-- Anyone can create a shared conversation (no auth required)
CREATE POLICY "Anyone can share a conversation"
  ON public.shared_conversations FOR INSERT
  WITH CHECK (true);
