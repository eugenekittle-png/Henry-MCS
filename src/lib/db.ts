import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = path.join(process.cwd(), "data", "henry-mcs.db");

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;

  // Ensure data directory exists
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Create tables
  db.exec(`
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
  const count = db.prepare("SELECT COUNT(*) as count FROM clients").get() as { count: number };
  if (count.count === 0) {
    seed(db);
  }

  return db;
}

function seed(db: Database.Database) {
  const insertClient = db.prepare(
    "INSERT INTO clients (client_number, name) VALUES (?, ?)"
  );
  const insertMatter = db.prepare(
    "INSERT INTO matters (client_id, matter_number, description) VALUES (?, ?, ?)"
  );

  const seedData = db.transaction(() => {
    const c1 = insertClient.run("CLT-001", "Acme Corporation");
    const c2 = insertClient.run("CLT-002", "Globex Industries");
    const c3 = insertClient.run("CLT-003", "Wayne Enterprises");
    const c4 = insertClient.run("CLT-004", "Stark Industries");

    insertMatter.run(c1.lastInsertRowid, "MTR-001", "Annual Compliance Review 2026");
    insertMatter.run(c1.lastInsertRowid, "MTR-002", "Contract Dispute — Supplier Agreement");
    insertMatter.run(c1.lastInsertRowid, "MTR-003", "IP Portfolio Assessment");

    insertMatter.run(c2.lastInsertRowid, "MTR-001", "Merger Due Diligence");
    insertMatter.run(c2.lastInsertRowid, "MTR-002", "Environmental Compliance Audit");

    insertMatter.run(c3.lastInsertRowid, "MTR-001", "Real Estate Acquisition — Gotham Tower");
    insertMatter.run(c3.lastInsertRowid, "MTR-002", "Employee Benefits Plan Review");
    insertMatter.run(c3.lastInsertRowid, "MTR-003", "Insurance Coverage Dispute");

    insertMatter.run(c4.lastInsertRowid, "MTR-001", "Patent Infringement Defense");
    insertMatter.run(c4.lastInsertRowid, "MTR-002", "Government Contract Review");
  });

  seedData();
}

export function getClients() {
  const db = getDb();
  return db
    .prepare("SELECT id, client_number, name FROM clients ORDER BY client_number")
    .all() as { id: number; client_number: string; name: string }[];
}

export function getMattersForClient(clientId: number) {
  const db = getDb();
  return db
    .prepare(
      "SELECT id, client_id, matter_number, description FROM matters WHERE client_id = ? ORDER BY matter_number"
    )
    .all(clientId) as {
    id: number;
    client_id: number;
    matter_number: string;
    description: string;
  }[];
}

export function getClient(id: number) {
  const db = getDb();
  return db
    .prepare("SELECT id, client_number, name FROM clients WHERE id = ?")
    .get(id) as { id: number; client_number: string; name: string } | undefined;
}

export function getMatter(id: number) {
  const db = getDb();
  return db
    .prepare("SELECT id, client_id, matter_number, description FROM matters WHERE id = ?")
    .get(id) as {
    id: number;
    client_id: number;
    matter_number: string;
    description: string;
  } | undefined;
}
