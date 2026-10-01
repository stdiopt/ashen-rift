import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const runs = sqliteTable('runs', {
  id: text('id').primaryKey(),
  startedAt: integer('started_at').notNull(),
  visitor: text('visitor').notNull(),
}, table => [index('idx_runs_visitor_started').on(table.visitor, table.startedAt)]);
export const highscores = sqliteTable('highscores', {
  runId: text('run_id').primaryKey().references(() => runs.id),
  name: text('name').notNull(),
  score: integer('score').notNull(),
  rifts: integer('rifts').notNull(),
  kills: integer('kills').notNull(),
  level: integer('level').notNull(),
  seconds: integer('seconds').notNull(),
  createdAt: integer('created_at').notNull(),
}, table => [index('idx_highscores_ranking').on(table.score, table.rifts, table.kills, table.createdAt)]);
