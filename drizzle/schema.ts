import { date, int, mysqlEnum, mysqlTable, text, timestamp, tinyint, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const licenses = mysqlTable("licenses", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  code: varchar("code", { length: 64 }).notNull().unique(),
  active: tinyint("active").default(0).notNull(),
  planCode: varchar("planCode", { length: 64 }).default("planejapro").notNull(),
  startDate: date("startDate"),
  expiresAt: date("expiresAt").notNull(),
  customerId: varchar("customerId", { length: 128 }),
  paymentId: varchar("paymentId", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type License = typeof licenses.$inferSelect;
export type InsertLicense = typeof licenses.$inferInsert;

export const productSettings = mysqlTable("product_settings", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).default("PlanejaPro SIAP").notNull(),
  priceCents: int("priceCents").default(5990).notNull(),
  installmentCount: int("installmentCount").default(6).notNull(),
  currency: varchar("currency", { length: 8 }).default("BRL").notNull(),
  description: text("description"),
  expiryDate: date("expiryDate").notNull(),
  asaasMode: mysqlEnum("asaasMode", ["sandbox", "production"]).default("sandbox").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ProductSettings = typeof productSettings.$inferSelect;

/** Vídeos tutoriais cadastrados pelo administrador e exibidos na página pública. */
export const tutorials = mysqlTable("tutorials", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 180 }).notNull(),
  description: text("description"),
  youtubeUrl: varchar("youtubeUrl", { length: 512 }).notNull(),
  youtubeVideoId: varchar("youtubeVideoId", { length: 32 }).notNull(),
  displayOrder: int("displayOrder").default(0).notNull(),
  isPublished: tinyint("isPublished").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Tutorial = typeof tutorials.$inferSelect;
export type InsertTutorial = typeof tutorials.$inferInsert;
