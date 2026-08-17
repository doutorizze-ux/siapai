/**
 * Inicialização do schema do SiapAI no boot do servidor.
 * Cria as tabelas `users`, `licenses` e `product_settings` (CREATE TABLE IF NOT EXISTS)
 * e garante a licença de teste para 02376222117@siapai.com.br.
 * Executado antes do servidor começar a escutar, com retry em caso de o MySQL
 * ainda não estar pronto (cold start em compose).
 */
import mysql from "mysql2/promise";

export const TABLES_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  openId VARCHAR(64) NOT NULL UNIQUE,
  name TEXT NULL,
  email VARCHAR(320) NULL,
  loginMethod VARCHAR(64) NULL,
  role ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  lastSignedIn TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS licenses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(320) NOT NULL,
  code VARCHAR(64) NOT NULL UNIQUE,
  active TINYINT(1) NOT NULL DEFAULT 0,
  planCode VARCHAR(64) NOT NULL DEFAULT 'planejapro',
  startDate DATE NULL,
  expiresAt DATE NOT NULL,
  customerId VARCHAR(128) NULL,
  paymentId VARCHAR(128) NULL,
  createdAt TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_licenses_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS product_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL DEFAULT 'SiapAI',
  priceCents INT NOT NULL DEFAULT 5990,
  installmentCount INT NOT NULL DEFAULT 6,
  currency VARCHAR(8) NOT NULL DEFAULT 'BRL',
  description VARCHAR(1000) NULL,
  expiryDate DATE NOT NULL,
  asaasMode VARCHAR(32) NOT NULL DEFAULT 'sandbox',
  createdAt TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS revisa_progress (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  licenseId INT NOT NULL,
  materialId INT NOT NULL,
  componentId INT NOT NULL,
  sequenceId INT NOT NULL,
  activityId INT NOT NULL,
  lessonNumber VARCHAR(64) NOT NULL DEFAULT '',
  completedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_revisa_progress_activity (licenseId, materialId, componentId, sequenceId, activityId),
  KEY idx_revisa_progress_lookup (licenseId, materialId, componentId, sequenceId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

const TEST_LICENSE = {
  email: "02376222117@siapai.com.br",
  code: "PP-TESTE-32",
  active: 1,
  planCode: "planejapro",
  startDate: "2026-01-01",
  expiresAt: "2026-12-31",
};

async function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

async function tryConnectWith(maxAttempts: number, delayMs: number, url: string) {
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const conn = await mysql.createConnection(url);
      await conn.ping();
      return conn;
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) {
        console.log(`[dbInit] tentativa ${attempt}/${maxAttempts} falhou (${(err as Error).message}), aguardando ${delayMs}ms...`);
        await sleep(delayMs);
      }
    }
  }
  throw lastErr;
}

function parseDbName(url: string): string {
  try {
    const u = new URL(url);
    const name = u.pathname.replace(/^\//, "");
    return name ? decodeURIComponent(name) : "";
  } catch {
    return "";
  }
}

function stripDbFromUrl(url: string): string {
  try {
    const u = new URL(url);
    u.pathname = "/";
    return u.toString();
  } catch {
    return url;
  }
}

async function ensureDatabase(): Promise<string> {
  const url = process.env.DATABASE_URL!;
  const dbName = parseDbName(url);
  if (!dbName) return url;
  // testa se o database já existe conectando diretamente
  const connUrl = url.includes("?") ? `${url}&multipleStatements=true` : `${url}?multipleStatements=true`;
  try {
    const conn = await mysql.createConnection(connUrl);
    await conn.ping();
    await conn.end();
    return url;
  } catch {
    // database pode não existir; conectar sem database e criar
    const base = stripDbFromUrl(url);
    const baseConnUrl = base.includes("?") ? `${base}&multipleStatements=true` : `${base}?multipleStatements=true`;
    const conn = await mysql.createConnection(baseConnUrl);
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await conn.end();
    console.log(`[dbInit] database \`${dbName}\` criado.`);
    return url;
  }
}

export async function initializeDatabase(): Promise<void> {
  const url = await ensureDatabase();
  const connUrl = url.includes("?") ? `${url}&multipleStatements=true` : `${url}?multipleStatements=true`;
  const conn = await tryConnectWith(12, 5000, connUrl);
  try {
    const statements = TABLES_SQL
      .split(/;\s*$/m)
      .map(s => s.trim())
      .filter(s => s.length > 0 && /^\s*(CREATE|ALTER|INSERT|UPDATE|SET)/i.test(s));
    for (const stmt of statements) {
      await conn.query(stmt);
    }
    console.log("[dbInit] tabelas users/licenses/product_settings/revisa_progress garantidas.");

    const [rows] = await conn.query(
      "SELECT id FROM licenses WHERE code = ?",
      [TEST_LICENSE.code]
    );
    if ((rows as unknown[]).length === 0) {
      await conn.query(
        `INSERT INTO licenses (email, code, active, planCode, startDate, expiresAt)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          TEST_LICENSE.email,
          TEST_LICENSE.code,
          TEST_LICENSE.active,
          TEST_LICENSE.planCode,
          TEST_LICENSE.startDate,
          TEST_LICENSE.expiresAt,
        ]
      );
      console.log("[dbInit] licença de teste inserida:", TEST_LICENSE.email);
    } else {
      await conn.query(
        "UPDATE licenses SET active = 1 WHERE code = ?",
        [TEST_LICENSE.code]
      );
      console.log("[dbInit] licença de teste mantida ativa:", TEST_LICENSE.email);
    }
  } finally {
    await conn.end();
  }
}
