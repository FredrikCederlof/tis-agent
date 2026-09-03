export type AgentConfigRow = {
  id: number;
  system_prompt: string;
  fixed_answers: unknown;
  strict_grounding?: boolean;
  similarity_threshold?: number;
  no_evidence_message?: string;
  no_evidence_messages?: string[] | { en?: string[] };
  greeting_message?: string | null;
  updated_at: string;
  updated_by: string | null;
};

export type UnansweredRow = {
  id: string;
  session_id: string;
  question: string;
  reply: string | null;
  language: string;
  outcome: string;
  top_similarity: number | null;
  document_titles: string[];
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  knowledge_entry_id?: string | null;
  wa_from?: string | null;
  wa_message_id?: string | null;
  human_replied_at?: string | null;
  human_replied_by?: string | null;
  manual_attention_at?: string | null;
  manual_attention_by?: string | null;
  attention_source?: "auto" | "manual" | string | null;
};

export type KnowledgeOrigin = "manual" | "inbox";
export type KnowledgeStatus = "active" | "archived";

export type KnowledgeEntry = {
  id: string;
  primary_question: string;
  similar_questions: string[];
  answer: string;
  category: string | null;
  tags: string[];
  source_note: string | null;
  origin: KnowledgeOrigin;
  origin_interaction_id: string | null;
  status: KnowledgeStatus;
  document_id: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

export type ChatSessionRow = {
  id: string;
  wa_from: string;
  started_at: string;
  last_message_at: string;
  message_count: number;
  primary_language: string | null;
  admin_read_at: string | null;
  unread: boolean;
  last_question: string | null;
  last_reply: string | null;
  last_outcome: string | null;
  needs_attention: boolean;
  needs_attention_count: number;
  last_admin_reply: string | null;
  last_admin_reply_at: string | null;
};

export type StatsRow = {
  sessions: number;
  questions: number;
  avg_questions_per_session: number | null;
  success_count: number;
  gap_count: number;
  fixed_answer_count: number;
  error_count: number;
};
