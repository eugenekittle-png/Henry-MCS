import { createClient } from "@libsql/client";
import { hashPassword } from "@/lib/password";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL || "file:data/henry-mcs.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});

let initialized = false;

// --- Principal ID generation ---

function generatePrincipalId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const suffix = Array.from(bytes).map(b => chars[b % chars.length]).join("");
  return `U-${suffix}`;
}

async function generateUniquePrincipalId(): Promise<string> {
  while (true) {
    const id = generatePrincipalId();
    const existing = await db.execute({ sql: "SELECT id FROM users WHERE username = ?", args: [id] });
    if (existing.rows.length === 0) return id;
  }
}

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

  // Migrate: add nav_pins column to users
  try {
    await db.execute(`ALTER TABLE users ADD COLUMN nav_pins TEXT NOT NULL DEFAULT '["assist"]'`);
  } catch {
    // column already exists
  }

  // Migrate: add 2FA and email columns to users
  for (const stmt of [
    "ALTER TABLE users ADD COLUMN email TEXT",
    "ALTER TABLE users ADD COLUMN totp_secret TEXT",
    "ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE users ADD COLUMN totp_backup_codes TEXT",
  ]) {
    try { await db.execute(stmt); } catch { /* already exists */ }
  }

  // Migrate: unique index on email
  try { await db.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (email) WHERE email IS NOT NULL"); } catch { /* exists */ }

  // Migrate: add first_name and last_name columns
  for (const stmt of [
    "ALTER TABLE users ADD COLUMN first_name TEXT",
    "ALTER TABLE users ADD COLUMN last_name TEXT",
    "ALTER TABLE users ADD COLUMN last_login_at TEXT",
  ]) {
    try { await db.execute(stmt); } catch { /* already exists */ }
  }

  // Migrate: backfill Principal IDs for users that predate this format
  const legacyUsers = await db.execute("SELECT id FROM users WHERE username NOT LIKE 'U-%'");
  for (const row of legacyUsers.rows) {
    const principalId = await generateUniquePrincipalId();
    await db.execute({ sql: "UPDATE users SET username = ? WHERE id = ?", args: [principalId, row.id] });
  }

  // Create settings table for firm-wide config
  await db.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

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

  // Migrate: add client_number / matter_number / ip_address columns to existing audit_logs tables
  for (const col of ["client_number", "matter_number", "ip_address"]) {
    try {
      await db.execute(`ALTER TABLE audit_logs ADD COLUMN ${col} TEXT`);
    } catch {
      // column already exists
    }
  }

  // Migrate: add login lockout columns to users table
  for (const stmt of [
    "ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE users ADD COLUMN locked_until TEXT",
  ]) {
    try {
      await db.execute(stmt);
    } catch {
      // column already exists
    }
  }

  // Migrate: add Azure/federated SSO columns to users table
  for (const stmt of [
    "ALTER TABLE users ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'local'",
    "ALTER TABLE users ADD COLUMN azure_id TEXT",
  ]) {
    try {
      await db.execute(stmt);
    } catch {
      // column already exists
    }
  }
  try {
    await db.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_azure_id ON users (azure_id) WHERE azure_id IS NOT NULL");
  } catch { /* exists */ }

  // Create suggestions tables
  await db.execute(`
    CREATE TABLE IF NOT EXISTS suggestions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      is_anonymous INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Submitted',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS suggestion_votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      suggestion_id INTEGER NOT NULL REFERENCES suggestions(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      count INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(suggestion_id, user_id)
    )
  `);
  // Migrate: add count column to existing suggestion_votes tables
  try { await db.execute("ALTER TABLE suggestion_votes ADD COLUMN count INTEGER NOT NULL DEFAULT 1"); } catch { /* exists */ }
  await db.execute(`
    CREATE TABLE IF NOT EXISTS suggestion_status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      suggestion_id INTEGER NOT NULL REFERENCES suggestions(id),
      status TEXT NOT NULL,
      comment TEXT,
      changed_by TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Matrix extraction templates (per-user)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS matrix_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      description TEXT,
      client_id INTEGER REFERENCES clients(id),
      matter_id INTEGER REFERENCES matters(id),
      client_number TEXT,
      matter_number TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  // Migrate: add client/matter columns to existing matrix_templates tables
  for (const stmt of [
    "ALTER TABLE matrix_templates ADD COLUMN client_id INTEGER REFERENCES clients(id)",
    "ALTER TABLE matrix_templates ADD COLUMN matter_id INTEGER REFERENCES matters(id)",
    "ALTER TABLE matrix_templates ADD COLUMN client_number TEXT",
    "ALTER TABLE matrix_templates ADD COLUMN matter_number TEXT",
  ]) {
    try { await db.execute(stmt); } catch { /* column already exists */ }
  }
  await db.execute(`
    CREATE TABLE IF NOT EXISTS matrix_template_columns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL REFERENCES matrix_templates(id),
      order_num INTEGER NOT NULL DEFAULT 0,
      column_name TEXT NOT NULL,
      instruction TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

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
  const adminId = await generateUniquePrincipalId();
  const userId = await generateUniquePrincipalId();

  await db.execute({
    sql: "INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)",
    args: [adminId, "admin@henry-mcs.local", adminHash, "admin"],
  });
  await db.execute({
    sql: "INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)",
    args: [userId, "user@henry-mcs.local", userHash, "user"],
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

export async function searchClients(search: string) {
  await ensureInit();
  const term = `%${search}%`;
  const result = await db.execute({
    sql: "SELECT id, client_number, name FROM clients WHERE client_number LIKE ? OR name LIKE ? ORDER BY client_number LIMIT 20",
    args: [term, term],
  });
  return result.rows as unknown as { id: number; client_number: string; name: string }[];
}

export async function searchMatters(clientId: number, search: string) {
  await ensureInit();
  const term = `%${search}%`;
  const result = await db.execute({
    sql: "SELECT id, client_id, matter_number, description FROM matters WHERE client_id = ? AND (matter_number LIKE ? OR description LIKE ?) ORDER BY matter_number LIMIT 20",
    args: [clientId, term, term],
  });
  return result.rows as unknown as { id: number; client_id: number; matter_number: string; description: string }[];
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

export async function getUserByEmail(email: string) {
  await ensureInit();
  const result = await db.execute({
    sql: "SELECT id, username, email, password_hash, role, must_change_password, failed_login_attempts, locked_until FROM users WHERE LOWER(email) = LOWER(?)",
    args: [email],
  });
  if (!result.rows[0]) return undefined;
  const row = result.rows[0] as unknown as { id: number; username: string; email: string; password_hash: string; role: "admin" | "user"; must_change_password: number; failed_login_attempts: number; locked_until: string | null };
  return { ...row, must_change_password: !!row.must_change_password, failed_login_attempts: row.failed_login_attempts ?? 0 };
}

export async function getUserByAzureId(azureId: string) {
  await ensureInit();
  const result = await db.execute({
    sql: "SELECT id, username, email, role, locked_until, auth_provider FROM users WHERE azure_id = ?",
    args: [azureId],
  });
  if (!result.rows[0]) return undefined;
  return result.rows[0] as unknown as { id: number; username: string; email: string; role: "admin" | "user"; locked_until: string | null; auth_provider: string };
}

export async function upsertAzureUser(azureId: string, email: string, displayName: string) {
  await ensureInit();
  // Check if a local user already exists with this email — if so, link the Azure ID to them
  const existing = await db.execute({
    sql: "SELECT id, username, email, role, locked_until FROM users WHERE LOWER(email) = LOWER(?)",
    args: [email],
  });
  if (existing.rows[0]) {
    const row = existing.rows[0] as unknown as { id: number; username: string; email: string; role: "admin" | "user"; locked_until: string | null };
    await db.execute({ sql: "UPDATE users SET azure_id = ?, auth_provider = 'azure' WHERE id = ?", args: [azureId, row.id] });
    return { ...row, isNew: false };
  }
  // No existing user — create one (no password, Azure-only account)
  const principalId = await generateUniquePrincipalId();
  const nameParts = displayName.trim().split(" ");
  const firstName = nameParts[0] ?? "";
  const lastName = nameParts.slice(1).join(" ") || "";
  await db.execute({
    sql: `INSERT INTO users (username, password_hash, role, must_change_password, email, first_name, last_name, auth_provider, azure_id)
          VALUES (?, '', 'user', 0, ?, ?, ?, 'azure', ?)`,
    args: [principalId, email.toLowerCase(), firstName, lastName, azureId],
  });
  const created = await db.execute({ sql: "SELECT id, username, email, role, locked_until FROM users WHERE azure_id = ?", args: [azureId] });
  const row = created.rows[0] as unknown as { id: number; username: string; email: string; role: "admin" | "user"; locked_until: string | null };
  return { ...row, isNew: true };
}

export async function incrementFailedLogins(userId: number) {
  await ensureInit();
  await db.execute({
    sql: `UPDATE users SET
            failed_login_attempts = failed_login_attempts + 1,
            locked_until = CASE WHEN failed_login_attempts + 1 >= 5 THEN datetime('now', '+15 minutes') ELSE locked_until END
          WHERE id = ?`,
    args: [userId],
  });
}

export async function resetFailedLogins(userId: number) {
  await ensureInit();
  await db.execute({
    sql: "UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?",
    args: [userId],
  });
}

export const DISABLED_SENTINEL = "9999-12-31 23:59:59";

export async function disableUser(userId: number) {
  await ensureInit();
  await db.execute({
    sql: "UPDATE users SET locked_until = ? WHERE id = ?",
    args: [DISABLED_SENTINEL, userId],
  });
}

export async function getUserLockStatus(userId: number): Promise<{ locked_until: string | null } | undefined> {
  await ensureInit();
  const result = await db.execute({
    sql: "SELECT locked_until FROM users WHERE id = ?",
    args: [userId],
  });
  if (!result.rows[0]) return undefined;
  return result.rows[0] as unknown as { locked_until: string | null };
}

export async function updateLastLogin(userId: number) {
  await ensureInit();
  await db.execute({
    sql: "UPDATE users SET last_login_at = datetime('now') WHERE id = ?",
    args: [userId],
  });
}

export async function getAllUsers() {
  await ensureInit();
  const result = await db.execute("SELECT id, username, email, first_name, last_name, role, created_at, last_login_at, failed_login_attempts, locked_until, totp_enabled FROM users ORDER BY email");
  return result.rows as unknown as { id: number; username: string; email: string; first_name: string | null; last_name: string | null; role: "admin" | "user"; created_at: string; last_login_at: string | null; failed_login_attempts: number; locked_until: string | null; totp_enabled: number }[];
}

export async function getUser(id: number) {
  await ensureInit();
  const result = await db.execute({
    sql: "SELECT id, username, email, first_name, last_name, role FROM users WHERE id = ?",
    args: [id],
  });
  return (result.rows[0] as unknown as { id: number; username: string; email: string; first_name: string | null; last_name: string | null; role: "admin" | "user" }) || undefined;
}

export async function dbCreateUser(email: string, passwordHash: string, role: "admin" | "user", firstName?: string, lastName?: string) {
  await ensureInit();
  const existingEmail = await db.execute({ sql: "SELECT id FROM users WHERE LOWER(email) = LOWER(?)", args: [email] });
  if (existingEmail.rows.length > 0) throw new Error("Email already in use");
  const principalId = await generateUniquePrincipalId();
  const result = await db.execute({
    sql: "INSERT INTO users (username, email, first_name, last_name, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)",
    args: [principalId, email.toLowerCase(), firstName || null, lastName || null, passwordHash, role],
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
  ipAddress?: string | null;
}) {
  await ensureInit();
  await db.execute({
    sql: `INSERT INTO audit_logs (username, action, client_number, matter_number, details, tokens_input, tokens_output, success, ip_address)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      params.username ?? null,
      params.action,
      params.clientNumber ?? null,
      params.matterNumber ?? null,
      params.details ? JSON.stringify(params.details) : null,
      params.tokensInput ?? null,
      params.tokensOutput ?? null,
      params.success ? 1 : 0,
      params.ipAddress ?? null,
    ],
  });
}

export async function getAuditLogs(limit = 200, offset = 0) {
  await ensureInit();
  const result = await db.execute({
    sql: `SELECT id, created_at, username, action, client_number, matter_number, details, tokens_input, tokens_output, success, ip_address
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
    ip_address: string | null;
  }[];
}

export async function getAuditLogCount() {
  await ensureInit();
  const result = await db.execute("SELECT COUNT(*) as count FROM audit_logs");
  return result.rows[0].count as number;
}

const BILLABLE_ACTIONS = ["assist", "chat", "breakdown", "compare", "compare-diff", "compare_diff", "summarize", "ask", "breakdown-file"];
const AUTH_ACTIONS = [
  "login", "logout",
  "change-password",
  "2fa-disabled",
  "user-create", "user-update", "user-delete",
  "settings-update",
  "client-create", "client-update", "client-delete",
  "matter-create", "matter-update", "matter-delete",
];
const authActionsPlaceholders = AUTH_ACTIONS.map(() => "?").join(",");

export async function getAuditLogsFiltered(params: {
  from?: string;
  to?: string;
  username?: string;
  limit?: number;
  offset?: number;
  billableOnly?: boolean;
  excludeAuthActions?: boolean;
}) {
  await ensureInit();
  const { from, to, username, limit = 200, offset = 0, billableOnly = false, excludeAuthActions = false } = params;
  const conditions: string[] = [];
  const args: (string | number)[] = [];

  if (username) { conditions.push("LOWER(username) = LOWER(?)"); args.push(username); }
  if (from) { conditions.push("created_at >= ?"); args.push(from); }
  if (to) { conditions.push("created_at <= ?"); args.push(to + " 23:59:59"); }
  if (billableOnly) {
    conditions.push(`LOWER(action) IN (${BILLABLE_ACTIONS.map(() => "?").join(",")})`);
    args.push(...BILLABLE_ACTIONS);
  }
  if (excludeAuthActions) {
    conditions.push(`LOWER(action) NOT IN (${AUTH_ACTIONS.map(() => "?").join(",")})`);
    args.push(...AUTH_ACTIONS);
  }

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

export async function getAuditLogsFilteredCount(params: { from?: string; to?: string; username?: string; billableOnly?: boolean; excludeAuthActions?: boolean }) {
  await ensureInit();
  const { from, to, username, billableOnly = false, excludeAuthActions = false } = params;
  const conditions: string[] = [];
  const args: string[] = [];

  if (username) { conditions.push("LOWER(username) = LOWER(?)"); args.push(username); }
  if (from) { conditions.push("created_at >= ?"); args.push(from); }
  if (to) { conditions.push("created_at <= ?"); args.push(to + " 23:59:59"); }
  if (billableOnly) {
    conditions.push(`LOWER(action) IN (${BILLABLE_ACTIONS.map(() => "?").join(",")})`);
    args.push(...BILLABLE_ACTIONS);
  }
  if (excludeAuthActions) {
    conditions.push(`LOWER(action) NOT IN (${AUTH_ACTIONS.map(() => "?").join(",")})`);
    args.push(...AUTH_ACTIONS);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await db.execute({ sql: `SELECT COUNT(*) as count FROM audit_logs ${where}`, args });
  return result.rows[0].count as number;
}

export async function getUsageByUser() {
  await ensureInit();
  const result = await db.execute({
    sql: `
      SELECT
        COALESCE(username, '(unknown)') as label,
        COUNT(*) as total_requests,
        SUM(CASE WHEN tokens_input IS NOT NULL THEN 1 ELSE 0 END) as ai_requests,
        COALESCE(SUM(tokens_input), 0) as total_input,
        COALESCE(SUM(tokens_output), 0) as total_output
      FROM audit_logs
      WHERE LOWER(action) NOT IN (${authActionsPlaceholders})
      GROUP BY COALESCE(username, '(unknown)')
      ORDER BY total_input + total_output DESC
    `,
    args: [...AUTH_ACTIONS],
  });
  return result.rows as unknown as UsageRow[];
}

export async function getUsageByClient() {
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
      WHERE LOWER(action) NOT IN (${authActionsPlaceholders})
      GROUP BY COALESCE(client_number, '(none)')
      ORDER BY total_input + total_output DESC
    `,
    args: [...AUTH_ACTIONS],
  });
  return result.rows as unknown as UsageRow[];
}

export async function getUsageByMatter() {
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
      WHERE LOWER(action) NOT IN (${authActionsPlaceholders})
      GROUP BY COALESCE(client_number, '(none)'), COALESCE(matter_number, '(none)')
      ORDER BY total_input + total_output DESC
    `,
    args: [...AUTH_ACTIONS],
  });
  return result.rows as unknown as UsageRow[];
}

export interface UsageRow {
  label: string;
  total_requests: number;
  ai_requests: number;
  total_input: number;
  total_output: number;
}

export async function getUsageForUser(username: string, from?: string, to?: string, billableOnly = false) {
  await ensureInit();
  const conditions = ["LOWER(username) = LOWER(?)", "success = 1"];
  const args: (string | number | null)[] = [username];
  if (from) { conditions.push("DATE(created_at) >= DATE(?)"); args.push(from); }
  if (to) { conditions.push("DATE(created_at) <= DATE(?)"); args.push(to); }
  if (billableOnly) {
    conditions.push(`LOWER(action) IN (${BILLABLE_ACTIONS.map(() => "?").join(",")})`);
    args.push(...BILLABLE_ACTIONS);
  }
  const result = await db.execute({
    sql: `
      SELECT
        action as label,
        COUNT(*) as total_requests,
        SUM(CASE WHEN tokens_input IS NOT NULL THEN 1 ELSE 0 END) as ai_requests,
        COALESCE(SUM(tokens_input), 0) as total_input,
        COALESCE(SUM(tokens_output), 0) as total_output
      FROM audit_logs
      WHERE ${conditions.join(" AND ")}
      GROUP BY action
      ORDER BY total_input + total_output DESC
    `,
    args,
  });
  return result.rows as unknown as UsageRow[];
}

export async function getUsageForUserByClient(username: string, from?: string, to?: string, billableOnly = false) {
  await ensureInit();
  const conditions = ["LOWER(username) = LOWER(?)", "success = 1"];
  const args: (string | number | null)[] = [username];
  if (from) { conditions.push("DATE(created_at) >= DATE(?)"); args.push(from); }
  if (to) { conditions.push("DATE(created_at) <= DATE(?)"); args.push(to); }
  if (billableOnly) {
    conditions.push(`LOWER(action) IN (${BILLABLE_ACTIONS.map(() => "?").join(",")})`);
    args.push(...BILLABLE_ACTIONS);
  }
  const result = await db.execute({
    sql: `
      SELECT
        COALESCE(client_number, '(none)') as label,
        COUNT(*) as total_requests,
        SUM(CASE WHEN tokens_input IS NOT NULL THEN 1 ELSE 0 END) as ai_requests,
        COALESCE(SUM(tokens_input), 0) as total_input,
        COALESCE(SUM(tokens_output), 0) as total_output
      FROM audit_logs
      WHERE ${conditions.join(" AND ")}
      GROUP BY COALESCE(client_number, '(none)')
      ORDER BY total_input + total_output DESC
    `,
    args,
  });
  return result.rows as unknown as UsageRow[];
}

export async function getUsageForUserByMatter(username: string, from?: string, to?: string, billableOnly = false) {
  await ensureInit();
  const conditions = ["LOWER(username) = LOWER(?)", "success = 1"];
  const args: (string | number | null)[] = [username];
  if (from) { conditions.push("DATE(created_at) >= DATE(?)"); args.push(from); }
  if (to) { conditions.push("DATE(created_at) <= DATE(?)"); args.push(to); }
  if (billableOnly) {
    conditions.push(`LOWER(action) IN (${BILLABLE_ACTIONS.map(() => "?").join(",")})`);
    args.push(...BILLABLE_ACTIONS);
  }
  const result = await db.execute({
    sql: `
      SELECT
        COALESCE(client_number, '(none)') || ' / ' || COALESCE(matter_number, '(none)') as label,
        COUNT(*) as total_requests,
        SUM(CASE WHEN tokens_input IS NOT NULL THEN 1 ELSE 0 END) as ai_requests,
        COALESCE(SUM(tokens_input), 0) as total_input,
        COALESCE(SUM(tokens_output), 0) as total_output
      FROM audit_logs
      WHERE ${conditions.join(" AND ")}
      GROUP BY COALESCE(client_number, '(none)'), COALESCE(matter_number, '(none)')
      ORDER BY total_input + total_output DESC
    `,
    args,
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

export type SuggestionStatus = "Submitted" | "Reviewed" | "Developing" | "Staging" | "Production";

export const SUGGESTION_VOTE_LIMIT = 10;

export interface Suggestion {
  id: number;
  user_id: number;
  username: string;
  title: string;
  description: string;
  is_anonymous: number;
  status: SuggestionStatus;
  created_at: string;
  vote_count: number;
  user_vote_count: number;
}

export async function getSuggestions(viewerUserId: number): Promise<Suggestion[]> {
  await ensureInit();
  const result = await db.execute({
    sql: `
      SELECT s.id, s.user_id, u.username, s.title, s.description, s.is_anonymous, s.status, s.created_at,
        COALESCE(SUM(sv.count), 0) as vote_count,
        COALESCE(SUM(CASE WHEN sv.user_id = ? THEN sv.count ELSE 0 END), 0) as user_vote_count
      FROM suggestions s
      JOIN users u ON u.id = s.user_id
      LEFT JOIN suggestion_votes sv ON sv.suggestion_id = s.id
      GROUP BY s.id
      ORDER BY vote_count DESC, s.created_at DESC
    `,
    args: [viewerUserId],
  });
  return result.rows as unknown as Suggestion[];
}

export async function getUserVotesUsed(userId: number): Promise<number> {
  await ensureInit();
  const result = await db.execute({
    sql: "SELECT COALESCE(SUM(count), 0) as total FROM suggestion_votes WHERE user_id = ?",
    args: [userId],
  });
  return result.rows[0].total as number;
}

export async function getSuggestion(id: number): Promise<Suggestion | undefined> {
  await ensureInit();
  const result = await db.execute({
    sql: `
      SELECT s.id, s.user_id, u.username, s.title, s.description, s.is_anonymous, s.status, s.created_at,
        COUNT(DISTINCT sv.id) as vote_count, 0 as user_voted
      FROM suggestions s
      JOIN users u ON u.id = s.user_id
      LEFT JOIN suggestion_votes sv ON sv.suggestion_id = s.id
      WHERE s.id = ?
      GROUP BY s.id
    `,
    args: [id],
  });
  return (result.rows[0] as unknown as Suggestion) || undefined;
}

export async function createSuggestion(userId: number, username: string, title: string, description: string, isAnonymous: boolean): Promise<number> {
  await ensureInit();
  const result = await db.execute({
    sql: "INSERT INTO suggestions (user_id, title, description, is_anonymous) VALUES (?, ?, ?, ?)",
    args: [userId, title, description, isAnonymous ? 1 : 0],
  });
  const suggestionId = Number(result.lastInsertRowid);
  await db.execute({
    sql: "INSERT INTO suggestion_status_history (suggestion_id, status, changed_by) VALUES (?, 'Submitted', ?)",
    args: [suggestionId, username],
  });
  return suggestionId;
}

export async function updateSuggestionStatus(id: number, status: SuggestionStatus, changedBy: string, comment?: string): Promise<void> {
  await ensureInit();
  await db.execute({
    sql: "UPDATE suggestions SET status = ? WHERE id = ?",
    args: [status, id],
  });
  await db.execute({
    sql: "INSERT INTO suggestion_status_history (suggestion_id, status, comment, changed_by) VALUES (?, ?, ?, ?)",
    args: [id, status, comment?.trim() || null, changedBy],
  });
}

export async function deleteSuggestion(id: number): Promise<void> {
  await ensureInit();
  await db.execute({ sql: "DELETE FROM suggestion_status_history WHERE suggestion_id = ?", args: [id] });
  await db.execute({ sql: "DELETE FROM suggestion_votes WHERE suggestion_id = ?", args: [id] });
  await db.execute({ sql: "DELETE FROM suggestions WHERE id = ?", args: [id] });
}

export interface StatusHistoryEntry {
  id: number;
  status: SuggestionStatus;
  comment: string | null;
  changed_by: string;
  created_at: string;
}

export async function getStatusHistory(suggestionId: number): Promise<StatusHistoryEntry[]> {
  await ensureInit();
  const result = await db.execute({
    sql: "SELECT id, status, comment, changed_by, created_at FROM suggestion_status_history WHERE suggestion_id = ? ORDER BY created_at ASC",
    args: [suggestionId],
  });
  return result.rows as unknown as StatusHistoryEntry[];
}

// ── Matrix templates ──────────────────────────────────────────────────────────

export interface MatrixTemplate {
  id: number;
  user_id: number;
  name: string;
  description: string | null;
  client_id: number | null;
  matter_id: number | null;
  client_number: string | null;
  matter_number: string | null;
  created_at: string;
  column_count: number;
}

export interface MatrixTemplateColumn {
  id: number;
  template_id: number;
  order_num: number;
  column_name: string;
  instruction: string | null;
  created_at: string;
}

export async function getMatrixTemplates(userId: number, clientNumber?: string, matterNumber?: string): Promise<MatrixTemplate[]> {
  await ensureInit();
  const conditions = ["t.user_id = ?"];
  const args: (string | number)[] = [userId];
  if (clientNumber) { conditions.push("t.client_number = ?"); args.push(clientNumber); }
  if (matterNumber) { conditions.push("t.matter_number = ?"); args.push(matterNumber); }
  const result = await db.execute({
    sql: `SELECT t.id, t.user_id, t.name, t.description,
            t.client_id, t.matter_id, t.client_number, t.matter_number, t.created_at,
            COUNT(c.id) as column_count
          FROM matrix_templates t
          LEFT JOIN matrix_template_columns c ON c.template_id = t.id
          WHERE ${conditions.join(" AND ")}
          GROUP BY t.id
          ORDER BY t.created_at DESC`,
    args,
  });
  return result.rows as unknown as MatrixTemplate[];
}

export async function getMatrixTemplate(id: number, userId: number): Promise<MatrixTemplate | undefined> {
  await ensureInit();
  const result = await db.execute({
    sql: `SELECT t.id, t.user_id, t.name, t.description,
            t.client_id, t.matter_id, t.client_number, t.matter_number, t.created_at,
            COUNT(c.id) as column_count
          FROM matrix_templates t
          LEFT JOIN matrix_template_columns c ON c.template_id = t.id
          WHERE t.id = ? AND t.user_id = ?
          GROUP BY t.id`,
    args: [id, userId],
  });
  return (result.rows[0] as unknown as MatrixTemplate) || undefined;
}

export async function createMatrixTemplate(
  userId: number, name: string, description: string,
  clientId: number, matterId: number, clientNumber: string, matterNumber: string
): Promise<number> {
  await ensureInit();
  const result = await db.execute({
    sql: "INSERT INTO matrix_templates (user_id, name, description, client_id, matter_id, client_number, matter_number) VALUES (?, ?, ?, ?, ?, ?, ?)",
    args: [userId, name, description || null, clientId, matterId, clientNumber, matterNumber],
  });
  return Number(result.lastInsertRowid);
}

export async function updateMatrixTemplate(id: number, userId: number, name: string, description: string): Promise<void> {
  await ensureInit();
  await db.execute({
    sql: "UPDATE matrix_templates SET name = ?, description = ? WHERE id = ? AND user_id = ?",
    args: [name, description || null, id, userId],
  });
}

export async function deleteMatrixTemplate(id: number, userId: number): Promise<void> {
  await ensureInit();
  await db.execute({ sql: "DELETE FROM matrix_template_columns WHERE template_id = ?", args: [id] });
  await db.execute({ sql: "DELETE FROM matrix_templates WHERE id = ? AND user_id = ?", args: [id, userId] });
}

export async function copyMatrixTemplate(
  sourceId: number, userId: number,
  newName: string,
  clientId: number, matterId: number, clientNumber: string, matterNumber: string
): Promise<number> {
  await ensureInit();
  const newResult = await db.execute({
    sql: "INSERT INTO matrix_templates (user_id, name, description, client_id, matter_id, client_number, matter_number) SELECT ?, ?, description, ?, ?, ?, ? FROM matrix_templates WHERE id = ? AND user_id = ?",
    args: [userId, newName, clientId, matterId, clientNumber, matterNumber, sourceId, userId],
  });
  const newId = Number(newResult.lastInsertRowid);
  // Copy all columns
  const cols = await getMatrixTemplateColumns(sourceId);
  for (const col of cols) {
    await db.execute({
      sql: "INSERT INTO matrix_template_columns (template_id, order_num, column_name, instruction) VALUES (?, ?, ?, ?)",
      args: [newId, col.order_num, col.column_name, col.instruction ?? null],
    });
  }
  return newId;
}

export async function getMatrixTemplateColumns(templateId: number): Promise<MatrixTemplateColumn[]> {
  await ensureInit();
  const result = await db.execute({
    sql: "SELECT id, template_id, order_num, column_name, instruction, created_at FROM matrix_template_columns WHERE template_id = ? ORDER BY order_num, id",
    args: [templateId],
  });
  return result.rows as unknown as MatrixTemplateColumn[];
}

export async function addMatrixTemplateColumn(templateId: number, columnName: string, instruction: string): Promise<MatrixTemplateColumn> {
  await ensureInit();
  const maxResult = await db.execute({
    sql: "SELECT COALESCE(MAX(order_num), -1) as max_order FROM matrix_template_columns WHERE template_id = ?",
    args: [templateId],
  });
  const nextOrder = (maxResult.rows[0].max_order as number) + 1;
  const result = await db.execute({
    sql: "INSERT INTO matrix_template_columns (template_id, order_num, column_name, instruction) VALUES (?, ?, ?, ?)",
    args: [templateId, nextOrder, columnName, instruction || null],
  });
  const id = Number(result.lastInsertRowid);
  const row = await db.execute({ sql: "SELECT id, template_id, order_num, column_name, instruction, created_at FROM matrix_template_columns WHERE id = ?", args: [id] });
  return row.rows[0] as unknown as MatrixTemplateColumn;
}

export async function updateMatrixTemplateColumn(id: number, templateId: number, columnName: string, instruction: string): Promise<void> {
  await ensureInit();
  await db.execute({
    sql: "UPDATE matrix_template_columns SET column_name = ?, instruction = ? WHERE id = ? AND template_id = ?",
    args: [columnName, instruction || null, id, templateId],
  });
}

export async function deleteMatrixTemplateColumn(id: number, templateId: number): Promise<void> {
  await ensureInit();
  await db.execute({ sql: "DELETE FROM matrix_template_columns WHERE id = ? AND template_id = ?", args: [id, templateId] });
}

export async function reorderMatrixTemplateColumns(templateId: number, orderedIds: number[]): Promise<void> {
  await ensureInit();
  for (let i = 0; i < orderedIds.length; i++) {
    await db.execute({
      sql: "UPDATE matrix_template_columns SET order_num = ? WHERE id = ? AND template_id = ?",
      args: [i, orderedIds[i], templateId],
    });
  }
}

export async function adjustSuggestionVote(
  suggestionId: number,
  userId: number,
  action: "add" | "remove"
): Promise<{ voteCount: number; userVoteCount: number; userVotesUsed: number; error?: string }> {
  await ensureInit();

  const existing = await db.execute({
    sql: "SELECT count FROM suggestion_votes WHERE suggestion_id = ? AND user_id = ?",
    args: [suggestionId, userId],
  });
  const currentUserCount = existing.rows.length > 0 ? (existing.rows[0].count as number) : 0;

  if (action === "add") {
    const totalUsed = await getUserVotesUsed(userId);
    if (totalUsed >= SUGGESTION_VOTE_LIMIT) {
      // Return current state without modifying
      const totals = await db.execute({
        sql: "SELECT COALESCE(SUM(count), 0) as total FROM suggestion_votes WHERE suggestion_id = ?",
        args: [suggestionId],
      });
      return {
        voteCount: totals.rows[0].total as number,
        userVoteCount: currentUserCount,
        userVotesUsed: totalUsed,
        error: `You have used all ${SUGGESTION_VOTE_LIMIT} votes`,
      };
    }
    if (existing.rows.length > 0) {
      await db.execute({
        sql: "UPDATE suggestion_votes SET count = count + 1 WHERE suggestion_id = ? AND user_id = ?",
        args: [suggestionId, userId],
      });
    } else {
      await db.execute({
        sql: "INSERT INTO suggestion_votes (suggestion_id, user_id, count) VALUES (?, ?, 1)",
        args: [suggestionId, userId],
      });
    }
  } else {
    if (currentUserCount <= 0) {
      const totals = await db.execute({
        sql: "SELECT COALESCE(SUM(count), 0) as total FROM suggestion_votes WHERE suggestion_id = ?",
        args: [suggestionId],
      });
      return { voteCount: totals.rows[0].total as number, userVoteCount: 0, userVotesUsed: await getUserVotesUsed(userId) };
    }
    if (currentUserCount === 1) {
      await db.execute({
        sql: "DELETE FROM suggestion_votes WHERE suggestion_id = ? AND user_id = ?",
        args: [suggestionId, userId],
      });
    } else {
      await db.execute({
        sql: "UPDATE suggestion_votes SET count = count - 1 WHERE suggestion_id = ? AND user_id = ?",
        args: [suggestionId, userId],
      });
    }
  }

  const newTotals = await db.execute({
    sql: "SELECT COALESCE(SUM(count), 0) as total FROM suggestion_votes WHERE suggestion_id = ?",
    args: [suggestionId],
  });
  const newUserRow = await db.execute({
    sql: "SELECT COALESCE(count, 0) as count FROM suggestion_votes WHERE suggestion_id = ? AND user_id = ?",
    args: [suggestionId, userId],
  });
  const newUserCount = newUserRow.rows.length > 0 ? (newUserRow.rows[0].count as number) : 0;
  const newTotalUsed = await getUserVotesUsed(userId);

  return {
    voteCount: newTotals.rows[0].total as number,
    userVoteCount: newUserCount,
    userVotesUsed: newTotalUsed,
  };
}

// --- Settings ---

export async function getSetting(key: string): Promise<string | null> {
  await ensureInit();
  const result = await db.execute({ sql: "SELECT value FROM settings WHERE key = ?", args: [key] });
  return result.rows[0]?.value as string | null ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await ensureInit();
  await db.execute({ sql: "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", args: [key, value] });
}

// --- 2FA ---

export async function getUserForAuth(userId: number): Promise<{
  id: number; username: string; role: string; email: string | null;
  first_name: string | null; last_name: string | null;
  password_hash: string;
  totp_secret: string | null; totp_enabled: number; totp_backup_codes: string | null;
  must_change_password: number;
} | null> {
  await ensureInit();
  const result = await db.execute({ sql: "SELECT id, username, role, email, first_name, last_name, password_hash, totp_secret, totp_enabled, totp_backup_codes, must_change_password FROM users WHERE id = ?", args: [userId] });
  if (!result.rows[0]) return null;
  return result.rows[0] as never;
}

export async function setUserTotp(userId: number, secret: string, backupCodesJson: string): Promise<void> {
  await ensureInit();
  await db.execute({ sql: "UPDATE users SET totp_secret = ?, totp_enabled = 1, totp_backup_codes = ? WHERE id = ?", args: [secret, backupCodesJson, userId] });
}

export async function disableUserTotp(userId: number): Promise<void> {
  await ensureInit();
  await db.execute({ sql: "UPDATE users SET totp_secret = NULL, totp_enabled = 0, totp_backup_codes = NULL WHERE id = ?", args: [userId] });
}

export async function updateUserBackupCodes(userId: number, backupCodesJson: string): Promise<void> {
  await ensureInit();
  await db.execute({ sql: "UPDATE users SET totp_backup_codes = ? WHERE id = ?", args: [backupCodesJson, userId] });
}

export async function updateUserEmail(userId: number, email: string | null): Promise<void> {
  await ensureInit();
  await db.execute({ sql: "UPDATE users SET email = ? WHERE id = ?", args: [email, userId] });
}

export async function updateUserProfile(userId: number, fields: { first_name?: string | null; last_name?: string | null; email?: string | null }): Promise<void> {
  await ensureInit();
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  if ("first_name" in fields) { sets.push("first_name = ?"); args.push(fields.first_name ?? null); }
  if ("last_name" in fields) { sets.push("last_name = ?"); args.push(fields.last_name ?? null); }
  if ("email" in fields) { sets.push("email = ?"); args.push(fields.email ? fields.email.toLowerCase() : null); }
  if (sets.length === 0) return;
  args.push(userId);
  await db.execute({ sql: `UPDATE users SET ${sets.join(", ")} WHERE id = ?`, args: args as import("@libsql/client").InArgs });
}

export async function getUserNavPins(userId: number): Promise<string[]> {
  await ensureInit();
  const result = await db.execute({
    sql: `SELECT nav_pins FROM users WHERE id = ?`,
    args: [userId],
  });
  const raw = result.rows[0]?.nav_pins as string | null;
  try {
    const parsed = JSON.parse(raw ?? '["assist"]');
    return Array.isArray(parsed) ? parsed : ["assist"];
  } catch {
    return ["assist"];
  }
}

export async function setUserNavPins(userId: number, pins: string[]): Promise<void> {
  await ensureInit();
  await db.execute({
    sql: `UPDATE users SET nav_pins = ? WHERE id = ?`,
    args: [JSON.stringify(pins), userId],
  });
}
