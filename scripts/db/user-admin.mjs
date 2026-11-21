#!/usr/bin/env node
// Command-line user management straight against PostgreSQL (create the first account, reset a password, change role...).
//
//   node --env-file=.env.local scripts/db/user-admin.mjs <command> [args]
//
//   create <email> [display name]      create an account (prompts for the password)
//   set-password <email>               set a new password (prompts) and sign the user out everywhere
//   set-role <email> <member|vip|admin>
//   disable <email> | enable <email>
//   list
import pg from "pg";
import { randomBytes, scrypt } from "node:crypto";
import readline from "node:readline";

const N = 32768, R = 8, P = 1, KEYLEN = 64; // must match lib/server/auth.ts

function hashPassword(password) {
  const salt = randomBytes(16);
  return new Promise((resolve, reject) =>
    scrypt(password.normalize("NFKC"), salt, KEYLEN, { N, r: R, p: P, maxmem: 128 * N * R * 2 }, (err, key) =>
      err ? reject(err) : resolve(`scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`)));
}

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) rl._writeToOutput = (text) => { if (text.includes(question)) process.stdout.write(text); };
    rl.question(question, (answer) => { rl.close(); if (hidden) process.stdout.write("\n"); resolve(answer); });
  });
}

async function askPassword() {
  const first = await ask("New password (min 8 characters): ", { hidden: true });
  if (first.length < 8 || first.length > 128) throw new Error("Password must be 8-128 characters.");
  const second = await ask("Repeat password: ", { hidden: true });
  if (first !== second) throw new Error("Passwords do not match.");
  return first;
}

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set (run with: node --env-file=.env.local ...)"); process.exit(1); }
const pool = new pg.Pool({ connectionString: url, ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED !== "false" } : undefined });
const [command, emailArg, ...rest] = process.argv.slice(2);
const email = emailArg?.trim().toLowerCase();

try {
  switch (command) {
    case "create": {
      if (!email) throw new Error("Usage: create <email> [display name]");
      const name = rest.join(" ").trim() || email.split("@")[0];
      const hash = await hashPassword(await askPassword());
      const r = await pool.query("INSERT INTO users (email, password_hash, display_name) VALUES ($1,$2,$3) RETURNING id", [email, hash, name]);
      console.log(`Created ${email} (${r.rows[0].id})`);
      break;
    }
    case "set-password": {
      if (!email) throw new Error("Usage: set-password <email>");
      const hash = await hashPassword(await askPassword());
      const r = await pool.query("UPDATE users SET password_hash = $2, updated_at = now() WHERE lower(email) = $1 RETURNING id", [email, hash]);
      if (!r.rowCount) throw new Error("No such user.");
      await pool.query("DELETE FROM sessions WHERE user_id = $1", [r.rows[0].id]);
      console.log("Password updated; all sessions revoked.");
      break;
    }
    case "set-role": {
      const role = rest[0];
      if (!email || !["member", "vip", "admin"].includes(role)) throw new Error("Usage: set-role <email> <member|vip|admin>");
      const r = await pool.query("UPDATE users SET role = $2, updated_at = now() WHERE lower(email) = $1", [email, role]);
      if (!r.rowCount) throw new Error("No such user.");
      console.log(`Role set to ${role}. (Admin panel access itself is controlled by the ADMIN_EMAILS environment variable.)`);
      break;
    }
    case "disable":
    case "enable": {
      if (!email) throw new Error(`Usage: ${command} <email>`);
      const r = await pool.query("UPDATE users SET status = $2, updated_at = now() WHERE lower(email) = $1 RETURNING id", [email, command === "disable" ? "disabled" : "active"]);
      if (!r.rowCount) throw new Error("No such user.");
      if (command === "disable") await pool.query("DELETE FROM sessions WHERE user_id = $1", [r.rows[0].id]);
      console.log(`Account ${command}d.`);
      break;
    }
    case "list": {
      const r = await pool.query("SELECT email, display_name, role, status, created_at FROM users ORDER BY created_at");
      console.table(r.rows);
      break;
    }
    default:
      console.log("Commands: create | set-password | set-role | disable | enable | list");
  }
} catch (error) {
  console.error("Error:", error.code === "23505" ? "That email already exists." : error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
