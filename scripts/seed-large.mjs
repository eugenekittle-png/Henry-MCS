/**
 * seed-large.mjs
 * Generates 40,000 clients and 200,000 matters into the local SQLite database.
 *
 * Usage:
 *   node scripts/seed-large.mjs           # local SQLite (default)
 *   node scripts/seed-large.mjs --turso   # Turso cloud database
 */

import { createClient } from "@libsql/client";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const useTurso = process.argv.includes("--turso");

let url, authToken;
if (useTurso) {
  // Load .env.local manually
  const envPath = resolve(__dirname, "../.env.local");
  const envText = readFileSync(envPath, "utf8");
  const env = Object.fromEntries(
    envText.split("\n").filter(l => l.includes("=")).map(l => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    })
  );
  url = env.TURSO_DATABASE_URL;
  authToken = env.TURSO_AUTH_TOKEN;
  console.log(`Connecting to Turso: ${url}`);
} else {
  url = "file:data/henry-mcs.db";
  console.log("Connecting to local SQLite: data/henry-mcs.db");
}

const db = createClient({ url, authToken });

// ── Name generation data ──────────────────────────────────────────────────────

const adjectives = ["Global","National","American","United","Premier","Allied","Capital","Heritage","Summit","Pinnacle","Apex","Pacific","Atlantic","Continental","Meridian","Horizon","Sterling","Keystone","Landmark","Ironwood","Crestview","Bridgewater","Clearwater","Lakeside","Riverside","Northgate","Westfield","Eastbrook","Southport","Highpoint","Redwood","Oakdale","Maplewood","Elmwood","Cedarbrook","Pinehurst","Willowbrook","Foxridge","Hawthorne","Thornwood"];

const industries = ["Industries","Solutions","Technologies","Enterprises","Holdings","Partners","Group","Associates","Ventures","Capital","Services","Systems","Resources","Logistics","Consulting","Properties","Development","Management","Financial","Healthcare","Pharmaceuticals","Construction","Manufacturing","Energy","Media","Communications","Realty","Investments","Advisors","Analytics"];

const entityTypes = ["Inc.","LLC","Corp.","Ltd.","LLP","Co.","Foundation","Trust","International","& Associates"];

const firstNames = ["James","Mary","John","Patricia","Robert","Jennifer","Michael","Linda","William","Barbara","David","Susan","Richard","Jessica","Joseph","Sarah","Thomas","Karen","Charles","Lisa","Christopher","Nancy","Daniel","Betty","Matthew","Margaret","Anthony","Sandra","Mark","Ashley","Donald","Dorothy","Steven","Kimberly","Paul","Emily","Andrew","Donna","Joshua","Michelle","Kenneth","Carol","Kevin","Amanda","Brian","Melissa","George","Deborah","Timothy","Stephanie","Ronald","Rebecca","Edward","Sharon","Jason","Laura","Jeffrey","Cynthia","Ryan","Kathleen","Jacob","Amy","Gary","Angela","Nicholas","Shirley","Eric","Anna","Jonathan","Brenda","Stephen","Pamela","Larry","Emma","Justin","Nicole","Scott","Helen","Brandon","Samantha","Benjamin","Katherine","Samuel","Christine","Raymond","Debra","Gregory","Rachel","Frank","Carolyn","Alexander","Janet","Patrick","Catherine","Jack","Maria"];

const lastNames = ["Smith","Johnson","Williams","Brown","Jones","Garcia","Miller","Davis","Rodriguez","Martinez","Hernandez","Lopez","Gonzalez","Wilson","Anderson","Thomas","Taylor","Moore","Jackson","Martin","Lee","Perez","Thompson","White","Harris","Sanchez","Clark","Ramirez","Lewis","Robinson","Walker","Young","Allen","King","Wright","Scott","Torres","Nguyen","Hill","Flores","Green","Adams","Nelson","Baker","Hall","Rivera","Campbell","Mitchell","Carter","Roberts","Turner","Phillips","Evans","Diaz","Parker","Cruz","Edwards","Collins","Reyes","Stewart","Morris","Morales","Murphy","Cook","Rogers","Gutierrez","Ortiz","Morgan","Cooper","Peterson","Bailey","Reed","Kelly","Howard","Ramos","Kim","Cox","Ward","Richardson","Watson","Brooks","Chavez","Wood","James","Bennett","Gray","Mendoza","Ruiz","Hughes","Price","Alvarez","Castillo","Sanders","Patel","Myers","Long","Ross","Foster","Jimenez"];

const matterTypes = [
  "Annual Compliance Review","Contract Negotiation","Merger Due Diligence","Acquisition Advisory","IP Portfolio Assessment","Patent Infringement Defense","Trademark Registration","Employment Dispute","Labor Arbitration","Real Estate Acquisition","Commercial Lease Review","Regulatory Investigation","SEC Compliance Review","Environmental Compliance","Tax Controversy","Corporate Restructuring","Bankruptcy Proceedings","Debt Restructuring","Insurance Coverage Dispute","Product Liability Defense","Class Action Defense","Shareholder Dispute","Board Governance Review","Antitrust Investigation","Data Privacy Compliance","GDPR Assessment","Cybersecurity Incident Response","Export Controls Review","Government Contracts Advisory","Construction Dispute","Premises Liability","Personal Injury Defense","Estate Planning","Trust Administration","Non-Disclosure Agreement","Software Licensing","Franchise Agreement Review","Supply Chain Contract","Distribution Agreement","Joint Venture Formation","Corporate Formation","Securities Offering","Private Equity Investment","Venture Capital Transaction","Commercial Litigation","Appellate Review","Mediation Proceedings","Arbitration Proceedings","Regulatory Licensing","Healthcare Compliance","HIPAA Assessment","FDA Regulatory Review","Finance Facility Review","Loan Syndication","Asset Finance","Receivership Proceedings","Immigration Compliance","Visa Applications","Cross-Border Transaction","Foreign Investment Review","Customs and Trade","Mining Rights","Oil and Gas Lease","Renewable Energy Project","Infrastructure Financing","Public Private Partnership","Bond Issuance","Municipal Advisory","Zoning and Land Use","Environmental Remediation","Workplace Safety Review","Executive Compensation","Equity Incentive Plan","Pension Fund Advisory","Employee Benefits Audit","Non-Compete Enforcement","Trade Secret Litigation","Copyright Infringement","Licensing Negotiation","Outsourcing Agreement","Technology Transfer","Clinical Trial Agreement","Life Sciences Advisory","Pharmaceutical Licensing","Medical Device Regulatory","Reimbursement Strategy","Telecom Regulatory","Broadcasting License","Media Rights Agreement","Sports Contract Review","Entertainment Agreement","Publishing Contract","Art and Collectibles","Charitable Giving Plan","Nonprofit Governance","Foundation Formation","Political Law Compliance","Lobbying Registration","Public Records Request","Freedom of Information","Defamation Defense","Privacy Litigation"]
  .map(t => t.replace(/\u2014/g, "-"));

// ── Helpers ───────────────────────────────────────────────────────────────────

function rng(seed) {
  // Simple seeded pseudo-random (xorshift)
  let s = seed + 1;
  return () => {
    s ^= s << 13; s ^= s >> 17; s ^= s << 5;
    return (s >>> 0) / 0xFFFFFFFF;
  };
}

function pick(arr, rand) {
  return arr[Math.floor(rand() * arr.length)];
}

function generateClientName(i, rand) {
  // Mix of company names and individual names (roughly 70/30)
  if (rand() < 0.70) {
    return `${pick(adjectives, rand)} ${pick(industries, rand)} ${pick(entityTypes, rand)}`;
  } else {
    return `${pick(firstNames, rand)} ${pick(lastNames, rand)}`;
  }
}

function padNum(n, width) {
  return String(n).padStart(width, "0");
}

// ── Main ──────────────────────────────────────────────────────────────────────

const TOTAL_CLIENTS = 40000;
const TOTAL_MATTERS = 200000;
const BATCH_SIZE = 500;

async function main() {
  const start = Date.now();

  // Check existing counts
  const existingClients = (await db.execute("SELECT COUNT(*) as c FROM clients")).rows[0].c;
  const existingMatters = (await db.execute("SELECT COUNT(*) as c FROM matters")).rows[0].c;
  console.log(`Existing records — clients: ${existingClients}, matters: ${existingMatters}`);

  if (existingClients > 10) {
    console.log("⚠  Clients table already has data. Aborting to avoid duplicates.");
    console.log("   To reseed, clear the table first.");
    process.exit(0);
  }

  // ── Insert clients ──────────────────────────────────────────────────────────
  console.log(`\nInserting ${TOTAL_CLIENTS.toLocaleString()} clients in batches of ${BATCH_SIZE}...`);

  const clientIds = []; // will store { index, rowid }
  let clientBatch = [];
  let clientsInserted = 0;

  for (let i = 1; i <= TOTAL_CLIENTS; i++) {
    const rand = rng(i * 7919);
    const clientNumber = `CLT-${i}`;
    const name = generateClientName(i, rand);
    clientBatch.push({ sql: "INSERT INTO clients (client_number, name) VALUES (?, ?)", args: [clientNumber, name] });

    if (clientBatch.length === BATCH_SIZE || i === TOTAL_CLIENTS) {
      await db.batch(clientBatch, "write");
      clientsInserted += clientBatch.length;
      clientBatch = [];
      process.stdout.write(`\r  ${clientsInserted.toLocaleString()} / ${TOTAL_CLIENTS.toLocaleString()}`);
    }
  }
  console.log(`\n  Done. (${((Date.now() - start) / 1000).toFixed(1)}s)`);

  // Fetch all client IDs
  console.log("\nFetching client IDs...");
  const clientRows = await db.execute("SELECT id, client_number FROM clients ORDER BY client_number");
  const clients = clientRows.rows.map(r => ({ id: Number(r.id), clientNumber: r.client_number }));
  console.log(`  Loaded ${clients.length.toLocaleString()} clients.`);

  // ── Distribute matters across clients ───────────────────────────────────────
  // Each client gets between 1 and 10 matters, distributed so total ≈ 200,000
  console.log(`\nInserting ${TOTAL_MATTERS.toLocaleString()} matters in batches of ${BATCH_SIZE}...`);

  let mattersInserted = 0;
  let matterBatch = [];
  let totalPlanned = 0;

  // Pre-calculate matter counts per client using seeded random
  const mattersPerClient = [];
  const rand0 = rng(42);
  for (let i = 0; i < clients.length; i++) {
    mattersPerClient.push(1 + Math.floor(rand0() * 10)); // 1–10
  }
  // Scale to hit exactly 200,000
  const rawTotal = mattersPerClient.reduce((a, b) => a + b, 0);
  const scale = TOTAL_MATTERS / rawTotal;

  const finalCounts = mattersPerClient.map(c => Math.max(1, Math.round(c * scale)));
  // Adjust rounding drift on last client
  const drift = TOTAL_MATTERS - finalCounts.reduce((a, b) => a + b, 0);
  finalCounts[finalCounts.length - 1] += drift;

  const t2 = Date.now();
  for (let ci = 0; ci < clients.length; ci++) {
    const client = clients[ci];
    const count = finalCounts[ci];
    const rand = rng(ci * 3571);

    for (let mi = 1; mi <= count; mi++) {
      const matterNumber = `MTR-${mi}`;
      const description = pick(matterTypes, rand) + (rand() < 0.4 ? ` ${2020 + Math.floor(rand() * 6)}` : "");
      matterBatch.push({
        sql: "INSERT OR IGNORE INTO matters (client_id, matter_number, description) VALUES (?, ?, ?)",
        args: [client.id, matterNumber, description],
      });

      if (matterBatch.length === BATCH_SIZE) {
        await db.batch(matterBatch, "write");
        mattersInserted += matterBatch.length;
        matterBatch = [];
        process.stdout.write(`\r  ${mattersInserted.toLocaleString()} / ${TOTAL_MATTERS.toLocaleString()}`);
      }
    }
  }

  if (matterBatch.length > 0) {
    await db.batch(matterBatch, "write");
    mattersInserted += matterBatch.length;
    process.stdout.write(`\r  ${mattersInserted.toLocaleString()} / ${TOTAL_MATTERS.toLocaleString()}`);
  }

  console.log(`\n  Done. (${((Date.now() - t2) / 1000).toFixed(1)}s)`);

  // ── Summary ─────────────────────────────────────────────────────────────────
  const finalClients = (await db.execute("SELECT COUNT(*) as c FROM clients")).rows[0].c;
  const finalMatters = (await db.execute("SELECT COUNT(*) as c FROM matters")).rows[0].c;
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`\n✓ Seeding complete in ${elapsed}s`);
  console.log(`  Clients: ${Number(finalClients).toLocaleString()}`);
  console.log(`  Matters: ${Number(finalMatters).toLocaleString()}`);
  process.exit(0);
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
