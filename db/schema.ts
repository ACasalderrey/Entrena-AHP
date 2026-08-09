import { sql } from "drizzle-orm";
import { check, index, primaryKey, real, sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

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
    // Los intentos anteriores a esta columna conservan NULL y la API deriva
    // entonces la fecha UTC de completedAt. Los clientes nuevos guardan el día
    // civil local para que una sesión nocturna no cambie de racha por zona horaria.
    studyDate: text("study_date"),
    contentType: text("content_type", { enum: ["all", "topic", "norm"] }).notNull().default("all"),
    contentId: text("content_id"),
    contentLabel: text("content_label"),
  },
  (table) => [
    index("idx_attempts_profile_completed").on(table.profileKey, table.completedAt),
    index("idx_attempts_profile_study_date").on(table.profileKey, table.studyDate),
  ],
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

export const profileSettings = sqliteTable(
  "profile_settings",
  {
    profileKey: text("profile_key").primaryKey(),
    weeklyGoal: integer("weekly_goal").notNull().default(4),
    gamificationEnabled: integer("gamification_enabled", { mode: "boolean" }).notNull().default(true),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    check("profile_settings_weekly_goal_check", sql`${table.weeklyGoal} BETWEEN 1 AND 7`),
    check(
      "profile_settings_gamification_enabled_check",
      sql`${table.gamificationEnabled} IN (0, 1)`,
    ),
  ],
);
