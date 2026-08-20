import { type InsertTutorial, type Tutorial } from "../drizzle/schema";
import { getDb } from "./db";

export type TutorialPatch = Partial<Pick<Tutorial, "title" | "description" | "youtubeUrl" | "youtubeVideoId" | "displayOrder" | "isPublished">>;

export async function getPublishedTutorials(): Promise<Tutorial[]> {
  const [rows] = await getDb().query(`SELECT * FROM tutorials WHERE isPublished = 1 ORDER BY displayOrder ASC, createdAt DESC, id DESC`);
  return rows as Tutorial[];
}

export async function getAllTutorials(): Promise<Tutorial[]> {
  const [rows] = await getDb().query(`SELECT * FROM tutorials ORDER BY displayOrder ASC, createdAt DESC, id DESC`);
  return rows as Tutorial[];
}

export async function createTutorial(input: Pick<InsertTutorial, "title" | "description" | "youtubeUrl" | "youtubeVideoId" | "displayOrder" | "isPublished">): Promise<Tutorial> {
  const pool = getDb();
  const [result] = await pool.query(
    `INSERT INTO tutorials (title, description, youtubeUrl, youtubeVideoId, displayOrder, isPublished, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [input.title, input.description ?? null, input.youtubeUrl, input.youtubeVideoId, input.displayOrder ?? 0, input.isPublished ?? 1],
  );
  const [rows] = await pool.query(`SELECT * FROM tutorials WHERE id = ? LIMIT 1`, [(result as { insertId: number }).insertId]);
  const tutorial = (rows as Tutorial[])[0];
  if (!tutorial) throw new Error("Falha ao criar o tutorial.");
  return tutorial;
}

export async function updateTutorial(id: number, patch: TutorialPatch): Promise<void> {
  const entries = Object.entries(patch).filter(([, value]) => value !== undefined);
  if (entries.length === 0) return;
  await getDb().query(
    `UPDATE tutorials SET ${entries.map(([field]) => `${field} = ?`).join(", ")}, updatedAt = NOW() WHERE id = ?`,
    [...entries.map(([, value]) => value), id],
  );
}

export async function deleteTutorial(id: number): Promise<void> {
  await getDb().query(`DELETE FROM tutorials WHERE id = ?`, [id]);
}

export async function getNextTutorialOrder(): Promise<number> {
  const [rows] = await getDb().query(`SELECT COALESCE(MAX(displayOrder), -1) + 1 AS nextOrder FROM tutorials`);
  return Number((rows as Array<{ nextOrder: number }>)[0]?.nextOrder ?? 0);
}
