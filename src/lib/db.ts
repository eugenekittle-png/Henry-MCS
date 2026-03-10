import { createClient } from "@libsql/client";
import { hashPassword } from "@/lib/auth";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL || "file:data/henry-mcs.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});

let initialized = false;

async function ensureInit() {
  if (initialized) return;
  initialized = true;

  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      must_change_password INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_number TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS matters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id),
      matter_number TEXT NOT NULL,
      description TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(client_id, matter_number)
    );
  `);

  // Add must_change_password column if missing (migration for existing DBs)
  try {
    await db.execute("ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 1");
  } catch {
    // column already exists
  }

  // Create audit_logs table if missing
  await db.execute(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT DEFAULT (datetime('now')),
      username TEXT,
      action TEXT NOT NULL,
      client_number TEXT,
      matter_number TEXT,
      details TEXT,
      tokens_input INTEGER,
      tokens_output INTEGER,
      success INTEGER NOT NULL DEFAULT 1
    )
  `);

  // Create playbooks tables if missing
  await db.execute(`
    CREATE TABLE IF NOT EXISTS playbooks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS playbook_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      playbook_id INTEGER NOT NULL REFERENCES playbooks(id),
      order_num INTEGER NOT NULL DEFAULT 0,
      check_name TEXT NOT NULL,
      instruction TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Migrate: add client_number / matter_number columns to existing audit_logs tables
  for (const col of ["client_number", "matter_number"]) {
    try {
      await db.execute(`ALTER TABLE audit_logs ADD COLUMN ${col} TEXT`);
    } catch {
      // column already exists
    }
  }

  // Seed users if empty
  const userCount = await db.execute("SELECT COUNT(*) as count FROM users");
  if ((userCount.rows[0].count as number) === 0) {
    await seedUsers();
  }

  // Seed clients if empty
  const result = await db.execute("SELECT COUNT(*) as count FROM clients");
  const count = result.rows[0].count as number;
  if (count === 0) {
    await seed();
  }

  // Seed playbooks if empty
  const pbCount = await db.execute("SELECT COUNT(*) as count FROM playbooks");
  if ((pbCount.rows[0].count as number) === 0) {
    await seedPlaybooks();
  }
}

async function seedUsers() {
  const adminHash = await hashPassword("Admin123!");
  const userHash = await hashPassword("User1234!");

  await db.execute({
    sql: "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
    args: ["admin", adminHash, "admin"],
  });
  await db.execute({
    sql: "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
    args: ["user", userHash, "user"],
  });
}

async function seed() {
  const c1 = await db.execute({
    sql: "INSERT INTO clients (client_number, name) VALUES (?, ?)",
    args: ["CLT-001", "Acme Corporation"],
  });
  const c2 = await db.execute({
    sql: "INSERT INTO clients (client_number, name) VALUES (?, ?)",
    args: ["CLT-002", "Globex Industries"],
  });
  const c3 = await db.execute({
    sql: "INSERT INTO clients (client_number, name) VALUES (?, ?)",
    args: ["CLT-003", "Wayne Enterprises"],
  });
  const c4 = await db.execute({
    sql: "INSERT INTO clients (client_number, name) VALUES (?, ?)",
    args: ["CLT-004", "Stark Industries"],
  });

  const matters = [
    [c1.lastInsertRowid, "MTR-001", "Annual Compliance Review 2026"],
    [c1.lastInsertRowid, "MTR-002", "Contract Dispute — Supplier Agreement"],
    [c1.lastInsertRowid, "MTR-003", "IP Portfolio Assessment"],
    [c2.lastInsertRowid, "MTR-001", "Merger Due Diligence"],
    [c2.lastInsertRowid, "MTR-002", "Environmental Compliance Audit"],
    [c3.lastInsertRowid, "MTR-001", "Real Estate Acquisition — Gotham Tower"],
    [c3.lastInsertRowid, "MTR-002", "Employee Benefits Plan Review"],
    [c3.lastInsertRowid, "MTR-003", "Insurance Coverage Dispute"],
    [c4.lastInsertRowid, "MTR-001", "Patent Infringement Defense"],
    [c4.lastInsertRowid, "MTR-002", "Government Contract Review"],
  ] as const;

  for (const [clientId, matterNumber, description] of matters) {
    await db.execute({
      sql: "INSERT INTO matters (client_id, matter_number, description) VALUES (?, ?, ?)",
      args: [clientId!, matterNumber, description],
    });
  }
}

async function seedPlaybooks() {
  const pb1 = await db.execute({
    sql: "INSERT INTO playbooks (name, description) VALUES (?, ?)",
    args: ["NDA Review", "Standard non-disclosure agreement review checklist"],
  });
  const pb1Id = pb1.lastInsertRowid;
  const ndaItems = [
    [0, "Parties", "Identify the Disclosing Party and Receiving Party. Are they clearly and correctly defined?"],
    [1, "Definition of Confidential Information", "How is confidential information defined? Is the definition appropriately broad or narrow? Does it cover oral disclosures?"],
    [2, "Exclusions from Confidentiality", "Are standard exclusions present — publicly available information, independently developed, received from third parties without restriction, or legally required disclosures?"],
    [3, "Obligations of Receiving Party", "What obligations does the Receiving Party have regarding use and protection of confidential information? Are use restrictions clear?"],
    [4, "Permitted Disclosures", "Under what circumstances may confidential information be disclosed (e.g., to employees on a need-to-know basis, affiliates, under legal process)? Are appropriate safeguards required?"],
    [5, "Term and Survival", "What is the duration of the NDA and the ongoing confidentiality obligations after termination?"],
    [6, "Return or Destruction", "Is there a requirement to return or destroy confidential materials upon request or termination?"],
    [7, "Injunctive Relief and Remedies", "Are equitable remedies such as injunctive relief expressly preserved? Is there an acknowledgment that breach would cause irreparable harm?"],
    [8, "Non-solicitation and Non-compete", "Are there any non-solicitation or non-compete restrictions? If so, are they reasonable in scope, geography, and duration?"],
    [9, "Governing Law and Jurisdiction", "What law governs the agreement and which courts have jurisdiction?"],
  ] as const;
  for (const [orderNum, checkName, instruction] of ndaItems) {
    await db.execute({
      sql: "INSERT INTO playbook_items (playbook_id, order_num, check_name, instruction) VALUES (?, ?, ?, ?)",
      args: [pb1Id!, orderNum, checkName, instruction],
    });
  }

  const pb2 = await db.execute({
    sql: "INSERT INTO playbooks (name, description) VALUES (?, ?)",
    args: ["MSA Review", "Master services agreement review checklist"],
  });
  const pb2Id = pb2.lastInsertRowid;
  const msaItems = [
    [0, "Scope of Services", "How are the services defined? Is the scope clear, specific, and unambiguous? Are statements of work or service orders referenced?"],
    [1, "Payment Terms", "What are the fees, payment schedule, invoicing procedures, and consequences of late payment? Are there provisions for price adjustments?"],
    [2, "Intellectual Property Ownership", "Who owns IP created under the agreement? Are there license-back provisions? How is background IP treated?"],
    [3, "Limitation of Liability", "Is there a liability cap? Is it mutual or one-sided? Are there carve-outs for gross negligence, wilful misconduct, or IP indemnification?"],
    [4, "Indemnification", "What are the indemnification obligations of each party? Are they mutual and proportionate? What is the indemnification procedure?"],
    [5, "Representations and Warranties", "What representations and warranties does each party make? Are there disclaimers of implied warranties?"],
    [6, "Confidentiality", "Is there a confidentiality obligation? How long does it survive termination? Does it reference any standalone NDA?"],
    [7, "Term and Termination", "What is the initial term? What are the rights to terminate for cause or convenience? What notice period is required? What are the post-termination obligations?"],
    [8, "Governing Law and Dispute Resolution", "What law governs? Is there an arbitration clause or exclusive jurisdiction provision? Is there a mandatory negotiation or mediation step?"],
    [9, "Force Majeure", "Is there a force majeure clause? Does it appropriately exclude payment obligations? How long must the force majeure event persist before termination rights arise?"],
  ] as const;
  for (const [orderNum, checkName, instruction] of msaItems) {
    await db.execute({
      sql: "INSERT INTO playbook_items (playbook_id, order_num, check_name, instruction) VALUES (?, ?, ?, ?)",
      args: [pb2Id!, orderNum, checkName, instruction],
    });
  }
}

export async function getPlaybooks(): Promise<{ id: number; name: string; description: string | null; created_at: string; item_count: number }[]> {
  await ensureInit();
  const result = await db.execute(
    `SELECT p.id, p.name, p.description, p.created_at, COUNT(pi.id) as item_count
     FROM playbooks p
     LEFT JOIN playbook_items pi ON pi.playbook_id = p.id
     GROUP BY p.id
     ORDER BY p.name`
  );
  return result.rows as unknown as { id: number; name: string; description: string | null; created_at: string; item_count: number }[];
}

export async function getPlaybook(id: number): Promise<{ id: number; name: string; description: string | null; created_at: string } | undefined> {
  await ensureInit();
  const result = await db.execute({
    sql: "SELECT id, name, description, created_at FROM playbooks WHERE id = ?",
    args: [id],
  });
  return (result.rows[0] as unknown as { id: number; name: string; description: string | null; created_at: string }) || undefined;
}

export async function createPlaybook(name: string, description: string): Promise<{ id: number; name: string; description: string | null; created_at: string } | undefined> {
  await ensureInit();
  const result = await db.execute({
    sql: "INSERT INTO playbooks (name, description) VALUES (?, ?)",
    args: [name, description],
  });
  return getPlaybook(Number(result.lastInsertRowid));
}

export async function updatePlaybook(id: number, name: string, description: string): Promise<void> {
  await ensureInit();
  await db.execute({
    sql: "UPDATE playbooks SET name = ?, description = ? WHERE id = ?",
    args: [name, description, id],
  });
}

export async function deletePlaybook(id: number): Promise<void> {
  await ensureInit();
  await db.execute({ sql: "DELETE FROM playbook_items WHERE playbook_id = ?", args: [id] });
  await db.execute({ sql: "DELETE FROM playbooks WHERE id = ?", args: [id] });
}

export async function getPlaybookItems(playbookId: number): Promise<{ id: number; playbook_id: number; order_num: number; check_name: string; instruction: string }[]> {
  await ensureInit();
  const result = await db.execute({
    sql: "SELECT id, playbook_id, order_num, check_name, instruction FROM playbook_items WHERE playbook_id = ? ORDER BY order_num, id",
    args: [playbookId],
  });
  return result.rows as unknown as { id: number; playbook_id: number; order_num: number; check_name: string; instruction: string }[];
}

export async function createPlaybookItem(playbookId: number, checkName: string, instruction: string, orderNum: number): Promise<void> {
  await ensureInit();
  await db.execute({
    sql: "INSERT INTO playbook_items (playbook_id, order_num, check_name, instruction) VALUES (?, ?, ?, ?)",
    args: [playbookId, orderNum, checkName, instruction],
  });
}

export async function updatePlaybookItem(id: number, checkName: string, instruction: string, orderNum: number): Promise<void> {
  await ensureInit();
  await db.execute({
    sql: "UPDATE playbook_items SET check_name = ?, instruction = ?, order_num = ? WHERE id = ?",
    args: [checkName, instruction, orderNum, id],
  });
}

export async function deletePlaybookItem(id: number): Promise<void> {
  await ensureInit();
  await db.execute({ sql: "DELETE FROM playbook_items WHERE id = ?", args: [id] });
}

export async function getClients() {
  await ensureInit();
  const result = await db.execute("SELECT id, client_number, name FROM clients ORDER BY client_number");
  return result.rows as unknown as { id: number; client_number: string; name: string }[];
}

export async function getMattersForClient(clientId: number) {
  await ensureInit();
  const result = await db.execute({
    sql: "SELECT id, client_id, matter_number, description FROM matters WHERE client_id = ? ORDER BY matter_number",
    args: [clientId],
  });
  return result.rows as unknown as { id: number; client_id: number; matter_number: string; description: string }[];
}

export async function getClient(id: number) {
  await ensureInit();
  const result = await db.execute({
    sql: "SELECT id, client_number, name FROM clients WHERE id = ?",
    args: [id],
  });
  return (result.rows[0] as unknown as { id: number; client_number: string; name: string }) || undefined;
}

export async function getMatter(id: number) {
  await ensureInit();
  const result = await db.execute({
    sql: "SELECT id, client_id, matter_number, description FROM matters WHERE id = ?",
    args: [id],
  });
  return (result.rows[0] as unknown as { id: number; client_id: number; matter_number: string; description: string }) || undefined;
}

export async function dbCreateClient(clientNumber: string, name: string) {
  await ensureInit();
  const result = await db.execute({
    sql: "INSERT INTO clients (client_number, name) VALUES (?, ?)",
    args: [clientNumber, name],
  });
  return getClient(Number(result.lastInsertRowid));
}

export async function updateClient(id: number, clientNumber: string, name: string) {
  await ensureInit();
  await db.execute({
    sql: "UPDATE clients SET client_number = ?, name = ? WHERE id = ?",
    args: [clientNumber, name, id],
  });
  return getClient(id);
}

export async function deleteClient(id: number) {
  await ensureInit();
  await db.execute({ sql: "DELETE FROM matters WHERE client_id = ?", args: [id] });
  await db.execute({ sql: "DELETE FROM clients WHERE id = ?", args: [id] });
}

export async function dbCreateMatter(clientId: number, matterNumber: string, description: string) {
  await ensureInit();
  const result = await db.execute({
    sql: "INSERT INTO matters (client_id, matter_number, description) VALUES (?, ?, ?)",
    args: [clientId, matterNumber, description],
  });
  return getMatter(Number(result.lastInsertRowid));
}

export async function updateMatter(id: number, matterNumber: string, description: string) {
  await ensureInit();
  await db.execute({
    sql: "UPDATE matters SET matter_number = ?, description = ? WHERE id = ?",
    args: [matterNumber, description, id],
  });
  return getMatter(id);
}

export async function deleteMatter(id: number) {
  await ensureInit();
  await db.execute({ sql: "DELETE FROM matters WHERE id = ?", args: [id] });
}

export async function getUserByUsername(username: string) {
  await ensureInit();
  const result = await db.execute({
    sql: "SELECT id, username, password_hash, role, must_change_password FROM users WHERE LOWER(username) = LOWER(?)",
    args: [username],
  });
  if (!result.rows[0]) return undefined;
  const row = result.rows[0] as unknown as { id: number; username: string; password_hash: string; role: "admin" | "user"; must_change_password: number };
  return { ...row, must_change_password: !!row.must_change_password };
}

export async function getAllUsers() {
  await ensureInit();
  const result = await db.execute("SELECT id, username, role, created_at FROM users ORDER BY username");
  return result.rows as unknown as { id: number; username: string; role: "admin" | "user"; created_at: string }[];
}

export async function getUser(id: number) {
  await ensureInit();
  const result = await db.execute({
    sql: "SELECT id, username, role FROM users WHERE id = ?",
    args: [id],
  });
  return (result.rows[0] as unknown as { id: number; username: string; role: "admin" | "user" }) || undefined;
}

export async function dbCreateUser(username: string, passwordHash: string, role: "admin" | "user") {
  await ensureInit();
  const result = await db.execute({
    sql: "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
    args: [username.toLowerCase(), passwordHash, role],
  });
  return getUser(Number(result.lastInsertRowid));
}

export async function updateUserRole(id: number, role: "admin" | "user") {
  await ensureInit();
  await db.execute({ sql: "UPDATE users SET role = ? WHERE id = ?", args: [role, id] });
  return getUser(id);
}

export async function updateUserPassword(id: number, passwordHash: string, mustChange = true) {
  await ensureInit();
  await db.execute({
    sql: "UPDATE users SET password_hash = ?, must_change_password = ? WHERE id = ?",
    args: [passwordHash, mustChange ? 1 : 0, id],
  });
}

export async function deleteUser(id: number) {
  await ensureInit();
  await db.execute({ sql: "DELETE FROM users WHERE id = ?", args: [id] });
}

export async function insertAuditLog(params: {
  username: string | null;
  action: string;
  clientNumber?: string | null;
  matterNumber?: string | null;
  details?: Record<string, unknown>;
  tokensInput?: number;
  tokensOutput?: number;
  success: boolean;
}) {
  await ensureInit();
  await db.execute({
    sql: `INSERT INTO audit_logs (username, action, client_number, matter_number, details, tokens_input, tokens_output, success)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      params.username ?? null,
      params.action,
      params.clientNumber ?? null,
      params.matterNumber ?? null,
      params.details ? JSON.stringify(params.details) : null,
      params.tokensInput ?? null,
      params.tokensOutput ?? null,
      params.success ? 1 : 0,
    ],
  });
}

export async function getAuditLogs(limit = 200, offset = 0) {
  await ensureInit();
  const result = await db.execute({
    sql: `SELECT id, created_at, username, action, client_number, matter_number, details, tokens_input, tokens_output, success
          FROM audit_logs ORDER BY id DESC LIMIT ? OFFSET ?`,
    args: [limit, offset],
  });
  return result.rows as unknown as {
    id: number;
    created_at: string;
    username: string | null;
    action: string;
    client_number: string | null;
    matter_number: string | null;
    details: string | null;
    tokens_input: number | null;
    tokens_output: number | null;
    success: number;
  }[];
}

export async function getAuditLogCount() {
  await ensureInit();
  const result = await db.execute("SELECT COUNT(*) as count FROM audit_logs");
  return result.rows[0].count as number;
}

export async function getAuditLogsFiltered(params: {
  from?: string;
  to?: string;
  username?: string;
  limit?: number;
  offset?: number;
}) {
  await ensureInit();
  const { from, to, username, limit = 200, offset = 0 } = params;
  const conditions: string[] = [];
  const args: (string | number)[] = [];

  if (username) { conditions.push("LOWER(username) = LOWER(?)"); args.push(username); }
  if (from) { conditions.push("created_at >= ?"); args.push(from); }
  if (to) { conditions.push("created_at <= ?"); args.push(to + " 23:59:59"); }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  args.push(limit, offset);

  const result = await db.execute({
    sql: `SELECT id, created_at, username, action, client_number, matter_number, tokens_input, tokens_output, success
          FROM audit_logs ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
    args,
  });
  return result.rows as unknown as {
    id: number;
    created_at: string;
    username: string | null;
    action: string;
    client_number: string | null;
    matter_number: string | null;
    tokens_input: number | null;
    tokens_output: number | null;
    success: number;
  }[];
}

export async function getAuditLogsFilteredCount(params: { from?: string; to?: string; username?: string }) {
  await ensureInit();
  const { from, to, username } = params;
  const conditions: string[] = [];
  const args: string[] = [];

  if (username) { conditions.push("LOWER(username) = LOWER(?)"); args.push(username); }
  if (from) { conditions.push("created_at >= ?"); args.push(from); }
  if (to) { conditions.push("created_at <= ?"); args.push(to + " 23:59:59"); }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await db.execute({ sql: `SELECT COUNT(*) as count FROM audit_logs ${where}`, args });
  return result.rows[0].count as number;
}

export async function getUsageByUser() {
  await ensureInit();
  const result = await db.execute(`
    SELECT
      COALESCE(username, '(unknown)') as label,
      COUNT(*) as total_requests,
      SUM(CASE WHEN tokens_input IS NOT NULL THEN 1 ELSE 0 END) as ai_requests,
      COALESCE(SUM(tokens_input), 0) as total_input,
      COALESCE(SUM(tokens_output), 0) as total_output
    FROM audit_logs
    GROUP BY COALESCE(username, '(unknown)')
    ORDER BY total_input + total_output DESC
  `);
  return result.rows as unknown as UsageRow[];
}

export async function getUsageByClient() {
  await ensureInit();
  const result = await db.execute(`
    SELECT
      COALESCE(client_number, '(none)') as label,
      COUNT(*) as total_requests,
      SUM(CASE WHEN tokens_input IS NOT NULL THEN 1 ELSE 0 END) as ai_requests,
      COALESCE(SUM(tokens_input), 0) as total_input,
      COALESCE(SUM(tokens_output), 0) as total_output
    FROM audit_logs
    GROUP BY COALESCE(client_number, '(none)')
    ORDER BY total_input + total_output DESC
  `);
  return result.rows as unknown as UsageRow[];
}

export async function getUsageByMatter() {
  await ensureInit();
  const result = await db.execute(`
    SELECT
      COALESCE(client_number, '(none)') || ' / ' || COALESCE(matter_number, '(none)') as label,
      COUNT(*) as total_requests,
      SUM(CASE WHEN tokens_input IS NOT NULL THEN 1 ELSE 0 END) as ai_requests,
      COALESCE(SUM(tokens_input), 0) as total_input,
      COALESCE(SUM(tokens_output), 0) as total_output
    FROM audit_logs
    GROUP BY COALESCE(client_number, '(none)'), COALESCE(matter_number, '(none)')
    ORDER BY total_input + total_output DESC
  `);
  return result.rows as unknown as UsageRow[];
}

export interface UsageRow {
  label: string;
  total_requests: number;
  ai_requests: number;
  total_input: number;
  total_output: number;
}

export async function getUsageForUser(username: string) {
  await ensureInit();
  const result = await db.execute({
    sql: `
      SELECT
        action as label,
        COUNT(*) as total_requests,
        SUM(CASE WHEN tokens_input IS NOT NULL THEN 1 ELSE 0 END) as ai_requests,
        COALESCE(SUM(tokens_input), 0) as total_input,
        COALESCE(SUM(tokens_output), 0) as total_output
      FROM audit_logs
      WHERE LOWER(username) = LOWER(?)
      GROUP BY action
      ORDER BY total_input + total_output DESC
    `,
    args: [username],
  });
  return result.rows as unknown as UsageRow[];
}

export async function getUsageForUserByClient(username: string) {
  await ensureInit();
  const result = await db.execute({
    sql: `
      SELECT
        COALESCE(client_number, '(none)') as label,
        COUNT(*) as total_requests,
        SUM(CASE WHEN tokens_input IS NOT NULL THEN 1 ELSE 0 END) as ai_requests,
        COALESCE(SUM(tokens_input), 0) as total_input,
        COALESCE(SUM(tokens_output), 0) as total_output
      FROM audit_logs
      WHERE LOWER(username) = LOWER(?)
      GROUP BY COALESCE(client_number, '(none)')
      ORDER BY total_input + total_output DESC
    `,
    args: [username],
  });
  return result.rows as unknown as UsageRow[];
}

export async function getUsageForUserByMatter(username: string) {
  await ensureInit();
  const result = await db.execute({
    sql: `
      SELECT
        COALESCE(client_number, '(none)') || ' / ' || COALESCE(matter_number, '(none)') as label,
        COUNT(*) as total_requests,
        SUM(CASE WHEN tokens_input IS NOT NULL THEN 1 ELSE 0 END) as ai_requests,
        COALESCE(SUM(tokens_input), 0) as total_input,
        COALESCE(SUM(tokens_output), 0) as total_output
      FROM audit_logs
      WHERE LOWER(username) = LOWER(?)
      GROUP BY COALESCE(client_number, '(none)'), COALESCE(matter_number, '(none)')
      ORDER BY total_input + total_output DESC
    `,
    args: [username],
  });
  return result.rows as unknown as UsageRow[];
}

export async function getAllMatters() {
  await ensureInit();
  const result = await db.execute(
    `SELECT m.id, m.client_id, m.matter_number, m.description, c.client_number, c.name as client_name
     FROM matters m JOIN clients c ON m.client_id = c.id
     ORDER BY c.client_number, m.matter_number`
  );
  return result.rows as unknown as {
    id: number;
    client_id: number;
    matter_number: string;
    description: string;
    client_number: string;
    client_name: string;
  }[];
}
