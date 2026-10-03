const schema = "commerce";

function privateLinkSQL(action) {
  if (action.action !== "create" || !/^[a-z][a-z0-9_]+$/.test(action.tableName) || typeof action.sql !== "string") {
    throw new Error("Only reviewed new private link tables may be created automatically.");
  }
  const target = `"${schema}"."${action.tableName}"`;
  const escapedTarget = target.replaceAll(".", "\\.");
  const statements = action.sql.split(";").map((part) => part.trim()).filter(Boolean);
  const approved = [];
  for (let statement of statements) {
    if (/^set names 'utf8'$/i.test(statement) || /^create schema if not exists "commerce"$/i.test(statement)) continue;
    // Upstream partial-index SQL may omit its schema. Make that target explicit
    // rather than relying on the connection's search path.
    statement = statement.replace(new RegExp(`^(create (?:unique )?index if not exists "[^"\\r\\n]+" on )"${action.tableName}"(?= \\()`, "i"), `$1${target}`);
    if (new RegExp(`^create table if not exists ${escapedTarget} \\(`, "i").test(statement) && !/\breferences\b/i.test(statement)) {
      approved.push(statement);
    } else if (new RegExp(`^create (?:unique )?index if not exists "[^"\\r\\n]+" on ${escapedTarget} \\(`, "i").test(statement)) {
      approved.push(statement);
    } else throw new Error(`Unexpected link DDL for ${action.tableName}; no extra schema permissions were granted.`);
  }
  if (!approved.some((statement) => /^create table /i.test(statement))) throw new Error("Link plan contains no approved table creation.");
  return approved.join(";\n") + ";";
}

async function run() {
  require("ts-node/register/transpile-only");
  const path = require("node:path");
  const { initializeContainer } = require(path.resolve("node_modules/@medusajs/medusa/dist/loaders/index.js"));
  const { MedusaAppLoader } = require("@medusajs/framework");
  const { ContainerRegistrationKeys } = require("@medusajs/framework/utils");
  const { configurationErrors } = await import("./preflight.mjs");
  const container = await initializeContainer(process.cwd());
  const pg = container.resolve(ContainerRegistrationKeys.PG_CONNECTION);
  try {
    const errors = configurationErrors(process.env);
    if (errors.length) throw new Error(errors.join("\n"));
    const config = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE);
    if (config.projectConfig.databaseSchema !== schema) throw new Error("Private link schema mismatch.");
    const planner = await new MedusaAppLoader({ container }).getLinksExecutionPlanner();
    const plan = await planner.createPlan();
    if (plan.some((action) => !["create", "noop"].includes(action.action))) throw new Error("Link changes or deletions require a reviewed migration; existing links were preserved.");
    const creates = plan.filter((action) => action.action === "create").map((action) => ({ action, sql: privateLinkSQL(action) }));
    await pg.transaction(async (transaction) => {
      await transaction.raw("select pg_advisory_xact_lock(hashtext('snowforce:commerce:links'))");
      await transaction.raw('set local search_path to "commerce"');
      for (const { action, sql } of creates) {
        await transaction.raw(sql);
        await transaction.withSchema(schema).table("link_module_migrations").insert({ table_name: action.tableName, link_descriptor: JSON.stringify(action.linkDescriptor) }).onConflict("table_name").ignore();
      }
      for (const action of plan) {
        if (!/^[a-z][a-z0-9_]+$/.test(action.tableName)) throw new Error("Invalid link table name.");
        const result = await transaction.raw("select to_regclass(?) is not null as present", [`${schema}.${action.tableName}`]);
        if (!result.rows[0].present) throw new Error(`Missing private link ${action.tableName}; migration rolled back.`);
      }
    });
    console.log(`Private links: ${creates.length} created; ${plan.length} verified inside commerce. Database CREATE permission remains revoked.`);
  } finally { await pg.destroy(); }
}

module.exports = { privateLinkSQL };
if (require.main === module) run().then(() => process.exit(0)).catch((error) => { console.error(error.message); process.exit(1); });
