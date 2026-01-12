export interface HistoryEntry {
  id: string;
  subject: string;
  date: string;
  score: number;
}

export interface Exam {
  id: string;
  title: string;
  description: string;
  subject: string;
  duration: number;
  is_published: boolean;
  created_at: string;
}

export interface Answer {
  id: string;
  question_id: string;
  content: string;
  is_correct: boolean;
  order_index: number;
}

export interface Question {
  id: string;
  content: string;
  question_type: 'multiple_choice' | 'true_false' | 'short_answer';
  explanation?: string;
  answers?: Answer[];
  part_number: number;
  order_in_part: number;
  tikz_image_url?: string;
}

export interface ExamMeta {
  title: string;
  duration: number;
  subject: string;
}

export interface ExamData {
  part1: Question[];
  part2: Question[];
  part3: Question[];
  examMeta: ExamMeta;
}
