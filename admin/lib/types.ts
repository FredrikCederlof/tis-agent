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
