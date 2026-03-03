import { createClient } from "@libsql/client";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL || "file:data/henry-mcs.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});

let initialized = false;

async function ensureInit() {
  if (initialized) return;
  initialized = true;

  await db.executeMultiple(`
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

  // Seed if empty
  const result = await db.execute("SELECT COUNT(*) as count FROM clients");
  const count = result.rows[0].count as number;
  if (count === 0) {
    await seed();
  }
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
