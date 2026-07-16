import { readdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const stateDir = join(".wrangler", "state", "v3", "d1", "miniflare-D1DatabaseObject");
const databaseFile = readdirSync(stateDir).find((name) => name.endsWith(".sqlite") && name !== "metadata.sqlite");
if (!databaseFile) throw new Error("Local D1 database was not found");

const changes = [
  ["test1", "mika.4827@example.com"],
  ["test2", "nova.7316@example.net"],
  ["test3", "leo.9054@example.org"],
];

const db = new DatabaseSync(join(stateDir, databaseFile));
db.exec("BEGIN");
try {
  const updateCustomer = db.prepare("UPDATE customers SET email = ? WHERE email = ?");
  const updateOrders = db.prepare("UPDATE orders SET customer_email = ? WHERE customer_email = ?");
  for (const [oldEmail, newEmail] of changes) {
    updateCustomer.run(newEmail, oldEmail);
    updateOrders.run(newEmail, oldEmail);
  }
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}

const users = db.prepare("SELECT id, email, name FROM customers WHERE id IN (?, ?, ?) ORDER BY id")
  .all("local-user-1", "local-user-2", "local-user-3");
console.log(JSON.stringify(users));
