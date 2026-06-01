import { execFileSync } from "node:child_process";

const STORAGE_BLOB_DATA_CONTRIBUTOR_ROLE = "Storage Blob Data Contributor";

function run(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    }).trim();
  } catch (error) {
    const stderr = error.stderr?.toString().trim();
    const stdout = error.stdout?.toString().trim();
    const detail = [stdout, stderr].filter(Boolean).join("\n");
    throw new Error(`Command failed: ${command} ${args.join(" ")}${detail ? `\n${detail}` : ""}`);
  }
}

function getAzdValue(name, required = true) {
  try {
    return run("azd", ["env", "get-value", name]).replace(/^"|"$/g, "").trim();
  } catch (error) {
    if (required) {
      throw error;
    }
    return "";
  }
}

function azJson(args) {
  const output = run("az", [...args, "-o", "json"]);
  return output ? JSON.parse(output) : null;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function parseStorageAccountName(accountUrl) {
  if (!accountUrl) {
    return "";
  }

  const parsed = new URL(accountUrl);
  return parsed.hostname.split(".")[0] || "";
}

function findStorageAccount(storageAccountName, preferredResourceGroup) {
  try {
    const account = azJson([
      "storage",
      "account",
      "show",
      "--resource-group",
      preferredResourceGroup,
      "--name",
      storageAccountName,
      "--query",
      "{id:id,name:name,allowBlobPublicAccess:allowBlobPublicAccess,publicNetworkAccess:publicNetworkAccess}",
    ]);
    if (account?.id) {
      return account;
    }
  } catch {
    // Fall back to subscription discovery for existing storage accounts.
  }

  const matches = azJson([
    "resource",
    "list",
    "--name",
    storageAccountName,
    "--resource-type",
    "Microsoft.Storage/storageAccounts",
    "--query",
    "[].{id:id,name:name,resourceGroup:resourceGroup}",
  ]);
  assert(Array.isArray(matches) && matches.length === 1, `Unable to uniquely resolve storage account ${storageAccountName}.`);

  return azJson([
    "storage",
    "account",
    "show",
    "--ids",
    matches[0].id,
    "--query",
    "{id:id,name:name,allowBlobPublicAccess:allowBlobPublicAccess,publicNetworkAccess:publicNetworkAccess}",
  ]);
}

function containerApp(name, resourceGroup) {
  return azJson(["containerapp", "show", "--resource-group", resourceGroup, "--name", name]);
}

function requireHealthyContainerApp(app, label) {
  assert(app?.properties?.provisioningState === "Succeeded", `${label} provisioning state is ${app?.properties?.provisioningState}`);
  const runningStatus = app?.properties?.runningStatus;
  if (runningStatus) {
    assert(runningStatus === "Running", `${label} running status is ${runningStatus}`);
  }
  assert(app?.identity?.principalId, `${label} managed identity principalId is missing`);
}

function envValue(app, name) {
  const env = app?.properties?.template?.containers?.[0]?.env || [];
  return env.find((entry) => entry.name === name)?.value || "";
}

function roleAssignments({ principalId, scope, role }) {
  return azJson([
    "role",
    "assignment",
    "list",
    "--assignee",
    principalId,
    "--scope",
    scope,
    "--role",
    role,
    "--include-inherited",
    "--query",
    "[].{name:name,scope:scope,role:roleDefinitionName}",
  ]);
}

function requireRole({ principalId, scope, role, label }) {
  const assignments = roleAssignments({ principalId, scope, role });
  assert(
    Array.isArray(assignments) && assignments.length > 0,
    `${label} is missing ${role} on ${scope}`,
  );
  console.log(`✓ ${label} has ${role} on ${scope}`);
}

function main() {
  const account = azJson(["account", "show", "--query", "{name:name,subscription:id,tenant:tenantId}"]);
  console.log(`Azure context: ${account.name} (${account.subscription}) tenant ${account.tenant}`);

  const resourceGroup = getAzdValue("AZURE_RESOURCE_GROUP");
  const backendName = getAzdValue("SERVICE_BACKEND_NAME");
  const frontendName = getAzdValue("SERVICE_FRONTEND_NAME", false);

  const backend = containerApp(backendName, resourceGroup);
  requireHealthyContainerApp(backend, `backend ${backendName}`);
  console.log(`✓ backend ${backendName} is provisioned with identity ${backend.identity.principalId}`);

  const frontend = frontendName ? containerApp(frontendName, resourceGroup) : null;
  if (frontendName) {
    requireHealthyContainerApp(frontend, `frontend ${frontendName}`);
    console.log(`✓ frontend ${frontendName} is provisioned with identity ${frontend.identity.principalId}`);
  }

  const storageAccountUrl =
    envValue(frontend, "AZURE_STORAGE_ACCOUNT_URL") ||
    envValue(backend, "AZURE_STORAGE_ACCOUNT_URL") ||
    getAzdValue("AZURE_STORAGE_ACCOUNT_URL", false);
  const storageAccountName = parseStorageAccountName(storageAccountUrl);
  assert(storageAccountName, "Unable to resolve AZURE_STORAGE_ACCOUNT_URL from Container App env or azd env.");

  const storageAccount = findStorageAccount(storageAccountName, resourceGroup);
  assert(storageAccount?.id, `Storage account ${storageAccountName} was not found in ${resourceGroup}.`);
  assert(storageAccount.allowBlobPublicAccess === false, "Storage account allows public blob access.");
  console.log(`✓ storage account ${storageAccount.name} exists with public blob access disabled`);

  requireRole({
    principalId: backend.identity.principalId,
    role: STORAGE_BLOB_DATA_CONTRIBUTOR_ROLE,
    scope: storageAccount.id,
    label: `backend ${backendName}`,
  });

  if (frontend) {
    requireRole({
      principalId: frontend.identity.principalId,
      role: STORAGE_BLOB_DATA_CONTRIBUTOR_ROLE,
      scope: storageAccount.id,
      label: `frontend ${frontendName}`,
    });
  }

  const backendStorageUrl = envValue(backend, "AZURE_STORAGE_ACCOUNT_URL");
  assert(backendStorageUrl, "Backend is missing AZURE_STORAGE_ACCOUNT_URL.");
  if (frontend) {
    const frontendStorageUrl = envValue(frontend, "AZURE_STORAGE_ACCOUNT_URL");
    assert(frontendStorageUrl, "Frontend is missing AZURE_STORAGE_ACCOUNT_URL; UI uploads will fail.");
  }
  console.log("✓ platform smoke checks passed");
}

main();
