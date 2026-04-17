const fs = require("fs");
const os = require("os");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const { Pool } = require("pg");

const isPostgres = Boolean(process.env.DATABASE_URL);

let sqlite;
let pool;

async function init() {
  if (isPostgres) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes("render.com")
        ? { rejectUnauthorized: false }
        : undefined,
    });

    await pool.query(`
      CREATE TABLE IF NOT EXISTS managers (
        id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS employees (
        id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        manager_id INTEGER NOT NULL REFERENCES managers(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(manager_id, email)
      );

      CREATE TABLE IF NOT EXISTS assignments (
        id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        manager_id INTEGER NOT NULL REFERENCES managers(id) ON DELETE CASCADE,
        employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        shift_name TEXT NOT NULL,
        audit_date DATE NOT NULL,
        shelf_start INTEGER NOT NULL,
        shelf_end INTEGER NOT NULL,
        shelf_count INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    return;
  }

  const dataDir = process.env.AUDIT_DATA_DIR
    ? path.resolve(process.env.AUDIT_DATA_DIR)
    : getDefaultDataDir();

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  sqlite = new DatabaseSync(path.join(dataDir, "audit-organizer.sqlite"));
  sqlite.exec("PRAGMA foreign_keys = ON;");
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS managers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      manager_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(manager_id, email),
      FOREIGN KEY (manager_id) REFERENCES managers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      manager_id INTEGER NOT NULL,
      employee_id INTEGER NOT NULL,
      shift_name TEXT NOT NULL,
      audit_date TEXT NOT NULL,
      shelf_start INTEGER NOT NULL,
      shelf_end INTEGER NOT NULL,
      shelf_count INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (manager_id) REFERENCES managers(id) ON DELETE CASCADE,
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
    );
  `);
}

async function query(text, params = []) {
  if (!isPostgres) {
    throw new Error("query is only available for Postgres mode.");
  }

  return pool.query(text, params);
}

function exec(sql) {
  if (isPostgres) {
    throw new Error("exec is only available for SQLite mode.");
  }

  return sqlite.exec(sql);
}

function prepare(sql) {
  if (isPostgres) {
    throw new Error("prepare is only available for SQLite mode.");
  }

  return sqlite.prepare(sql);
}

function getMode() {
  return isPostgres ? "postgres" : "sqlite";
}

module.exports = {
  init,
  query,
  exec,
  prepare,
  getMode,
};

function getDefaultDataDir() {
  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, "AuditOrganizer");
  }

  return path.join(os.homedir(), ".audit-organizer");
}
