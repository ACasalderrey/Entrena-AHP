import { index, primaryKey, real, sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const attempts = sqliteTable(
  "attempts",
  {
    id: text("id").primaryKey(),
    profileKey: text("profile_key").notNull(),
    completedAt: integer("completed_at").notNull(),
    mode: text("mode").notNull(),
    total: integer("total").notNull(),
    correct: integer("correct").notNull(),
    incorrect: integer("incorrect").notNull(),
    blank: integer("blank").notNull(),
    directScore: real("direct_score").notNull(),
    durationMs: integer("duration_ms"),
    timeLimitMs: integer("time_limit_ms"),
  },
  (table) => [index("idx_attempts_profile_completed").on(table.profileKey, table.completedAt)],
);

export const attemptAnswers = sqliteTable(
  "attempt_answers",
  {
    attemptId: text("attempt_id").notNull(),
    profileKey: text("profile_key").notNull(),
    questionId: text("question_id").notNull(),
    selectedOption: text("selected_option"),
    status: text("status").notNull(),
    completedAt: integer("completed_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.attemptId, table.questionId] }),
    index("idx_answers_profile_question").on(table.profileKey, table.questionId),
  ],
);
