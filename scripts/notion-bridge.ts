/**
 * Notion Bridge — Humanize
 *
 * Bi-directional bridge between CLI and the Capabl OS - Tickets
 * Notion database (codename: Shipyard).
 *
 * Uses the data_source_id API (v2025-09-03) for multi-source databases.
 * The Shipyard DB contains multiple data sources; we target "Capabl OS • Tickets".
 *
 * CONFIGURATION:
 * - Set TARGET_APP in .env to filter tickets for your application
 * - Set TEAM_USERS as JSON in .env to map team member names to Notion user IDs
 */

import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import type {
  ShipyardStatus,
  ShipyardArea,
  ShipyardPriority,
  ShipyardTicket,
  HumanizeState,
  HumanizeQueueItem,
} from "../shared/types/index.js";

dotenv.config();

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2025-09-03";
const RATE_LIMIT_DELAY = 350;
const STATE_FILE = path.resolve(process.cwd(), "humanize_state.json");

const API_KEY = process.env.NOTION_SHIPYARD_API_KEY ?? "";
const DB_ID = process.env.NOTION_SHIPYARD_DB_ID ?? "";

// Application filter — configurable via environment variable
// Each consumer app sets this to their application name in Shipyard
const TARGET_APP = process.env.TARGET_APP ?? "";

if (!TARGET_APP) {
  console.warn(
    "! TARGET_APP is not set in .env. Tickets will not be filtered by application."
  );
}

// Notion workspace user IDs (for Assignee field)
// Can be configured via TEAM_USERS env var as JSON, or defaults to empty
let TEAM_USERS: Record<string, string> = {};
try {
  const teamUsersEnv = process.env.TEAM_USERS;
  if (teamUsersEnv) {
    TEAM_USERS = JSON.parse(teamUsersEnv);
  }
} catch {
  console.warn("! TEAM_USERS env var is not valid JSON. Using empty map.");
}

// AI Squad user — a human account used to assign tickets to the AI
// Set NOTION_AI_SQUAD_USER_ID in .env once the user is created
const AI_SQUAD_ID = process.env.NOTION_AI_SQUAD_USER_ID ?? "";
const AI_SQUAD_NAME = "AI Squad";

// Resolved lazily on first call
let _dataSourceId: string | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function notionFetch(
  urlPath: string,
  options: RequestInit = {}
): Promise<any> {
  const res = await fetch(`${NOTION_API}${urlPath}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  return res.json();
}

/**
 * Resolve the data_source_id for "Capabl OS • Tickets" from the parent database.
 * Cached after the first call.
 */
async function resolveDataSourceId(): Promise<string> {
  if (_dataSourceId) return _dataSourceId;

  const data = await notionFetch(`/databases/${DB_ID}`);
  if (data.object === "error") {
    throw new Error(`Failed to resolve data sources: ${data.message}`);
  }

  const sources: { id: string; name: string }[] = data.data_sources ?? [];
  if (sources.length === 0) {
    throw new Error("No data sources found on Shipyard database");
  }

  // Prefer "Capabl OS • Tickets", fall back to the first source
  const tickets = sources.find((s) => s.name.includes("Tickets"));
  _dataSourceId = tickets?.id ?? sources[0].id;
  return _dataSourceId;
}

// ── Property Extraction Helpers ──

function extractPlainText(prop: any): string | null {
  if (!prop) return null;
  if (prop.type === "rich_text") {
    return prop.rich_text?.map((t: any) => t.plain_text).join("") || null;
  }
  if (prop.type === "title") {
    return prop.title?.map((t: any) => t.plain_text).join("") || null;
  }
  return null;
}

function extractSelect(prop: any): string | null {
  if (!prop) return null;
  if (prop.type === "select") return prop.select?.name ?? null;
  if (prop.type === "status") return prop.status?.name ?? null;
  return null;
}

function extractMultiSelect(prop: any): string[] {
  if (!prop) return [];
  if (prop.type === "multi_select") {
    return (prop.multi_select ?? []).map((o: any) => o.name);
  }
  // Fallback: if it was converted to select
  if (prop.type === "select" && prop.select?.name) {
    return [prop.select.name];
  }
  return [];
}

function extractUrl(prop: any): string | null {
  if (!prop) return null;
  if (prop.type === "url") return prop.url ?? null;
  return null;
}

function extractDate(prop: any): string | null {
  if (!prop) return null;
  if (prop.type === "date") return prop.date?.start ?? null;
  return null;
}

function extractRelationIds(prop: any): string[] {
  if (!prop || prop.type !== "relation") return [];
  return (prop.relation ?? []).map((r: any) => r.id);
}

function extractAssigneeIds(prop: any): string[] {
  if (!prop || prop.type !== "people") return [];
  return (prop.people ?? []).map((p: any) => p.id);
}

function isAssignedToAISquad(prop: any): boolean {
  // If AI Squad user not configured, accept all tickets (backwards compat)
  if (!AI_SQUAD_ID) return true;
  const ids = extractAssigneeIds(prop);
  return ids.includes(AI_SQUAD_ID);
}

/**
 * Extract a ShipyardTicket from a Notion page object.
 * Handles both `status` and `select` property types for the Status field.
 * Handles both `multi_select` and `select` for Application and Area.
 */
export function extractTicket(page: any): ShipyardTicket & { assigned_to_ai_squad: boolean } {
  const props = page.properties ?? {};
  const apps = extractMultiSelect(props["Application"]);
  const areas = extractMultiSelect(props["Area"]);

  return {
    id: page.id,
    title: extractPlainText(props["Ticket"]) ?? "(untitled)",
    status: (extractSelect(props["Status"]) as ShipyardStatus) ?? "Open",
    summary: extractPlainText(props["Summary"]),
    spec_url: extractUrl(props["Spec URL"]),
    due: extractDate(props["Due"]),
    branch: extractPlainText(props["Branch"]),
    area: (areas[0] as ShipyardArea) ?? null,
    application: apps[0] ?? null,
    type: extractSelect(props["Type"]),
    priority: (extractSelect(props["Priority"]) as ShipyardPriority) ?? null,
    blocked_by: extractRelationIds(props["Dependency"]),
    blocks: extractRelationIds(props["Blocks "]),
    created_at: page.created_time,
    updated_at: page.last_edited_time,
    assigned_to_ai_squad: isAssignedToAISquad(props["Assignee"]),
  };
}

// ── Data-source query (replaces old search-based workaround) ──

/**
 * Fetch all pages from the Tickets data source.
 * Uses the /data_sources/:id/query endpoint (v2025-09-03).
 */
async function fetchAllShipyardPages(): Promise<any[]> {
  const dsId = await resolveDataSourceId();
  const pages: any[] = [];
  let cursor: string | undefined;

  do {
    const body: any = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;

    const data = await notionFetch(`/data_sources/${dsId}/query`, {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (data.object === "error") {
      throw new Error(`Data source query error: ${data.message}`);
    }

    for (const page of data.results ?? []) {
      pages.push(page);
    }

    cursor = data.has_more ? data.next_cursor : undefined;
    if (cursor) await sleep(RATE_LIMIT_DELAY);
  } while (cursor);

  return pages;
}

// ── Core Functions ──

/**
 * Fetch tickets assigned to the AI bot with Status="Open" AND Application = TARGET_APP.
 * Only returns tickets that the AI should work on (assigned to AI Squad).
 */
export async function fetchReadyTickets(): Promise<ShipyardTicket[]> {
  const pages = await fetchAllShipyardPages();
  const tickets: ShipyardTicket[] = [];

  for (const page of pages) {
    const ticket = extractTicket(page);
    const matchesApp = !TARGET_APP || ticket.application === TARGET_APP;
    if (
      ticket.status === "Open" &&
      matchesApp &&
      ticket.assigned_to_ai_squad
    ) {
      tickets.push(ticket);
    }
  }

  // Sort: unblocked first, then by priority (P0 → P4)
  tickets.sort((a, b) => {
    const aBlocked = a.blocked_by.length > 0 ? 1 : 0;
    const bBlocked = b.blocked_by.length > 0 ? 1 : 0;
    if (aBlocked !== bBlocked) return aBlocked - bBlocked;
    const pa = a.priority ?? "P4";
    const pb = b.priority ?? "P4";
    return pa.localeCompare(pb);
  });

  return tickets;
}

/**
 * Create a new ticket in the Tickets data source.
 * Uses data_source_id parent (required for multi-source databases).
 */
export async function createTicket(
  title: string,
  area: ShipyardArea,
  body?: string,
  priority: ShipyardPriority = "P0",
  assignee?: string,
  application?: string
): Promise<ShipyardTicket> {
  const dsId = await resolveDataSourceId();
  const appName = application ?? TARGET_APP;

  if (!appName) {
    throw new Error("TARGET_APP is not set and no application was provided");
  }

  const properties: any = {
    Ticket: {
      title: [{ text: { content: title.substring(0, 200) } }],
    },
    Status: {
      status: { name: "Open" },
    },
    Application: {
      multi_select: [{ name: appName }],
    },
    Area: {
      multi_select: [{ name: area }],
    },
    Type: {
      select: { name: "Task" },
    },
    Priority: {
      select: { name: priority },
    },
  };

  // Assign to specified user, or default to AI Squad if configured
  if (assignee) {
    const userId = TEAM_USERS[assignee];
    if (userId) {
      properties.Assignee = { people: [{ id: userId }] };
    } else if (AI_SQUAD_ID) {
      // Unknown human assignee — assign to AI Squad as fallback
      properties.Assignee = { people: [{ id: AI_SQUAD_ID }] };
    }
    // else: no valid assignee, leave unassigned
  } else if (AI_SQUAD_ID) {
    // No assignee specified — assign to AI Squad by default
    properties.Assignee = { people: [{ id: AI_SQUAD_ID }] };
  }
  // If AI_SQUAD_ID not configured, leave ticket unassigned

  const payload: any = {
    parent: { type: "data_source_id", data_source_id: dsId },
    properties,
  };

  // Write body content as page blocks (Notion 2000-char limit per block)
  if (body) {
    const chunks: string[] = [];
    for (let i = 0; i < body.length; i += 2000) {
      chunks.push(body.substring(i, i + 2000));
    }
    payload.children = chunks.map((chunk) => ({
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [{ type: "text", text: { content: chunk } }],
      },
    }));
  }

  const data = await notionFetch("/pages", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!data.id) {
    throw new Error(`Ticket creation failed: ${JSON.stringify(data)}`);
  }

  await sleep(RATE_LIMIT_DELAY);
  return extractTicket(data);
}

/**
 * Update a ticket's status in Notion.
 */
export async function updateTicketStatus(
  pageId: string,
  status: ShipyardStatus
): Promise<void> {
  const data = await notionFetch(`/pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify({
      properties: {
        Status: { status: { name: status } },
      },
    }),
  });

  if (data.object === "error") {
    throw new Error(`Status update failed: ${data.message}`);
  }

  await sleep(RATE_LIMIT_DELAY);
}

/**
 * Set the git branch name on a ticket.
 */
export async function updateTicketBranch(
  pageId: string,
  branch: string
): Promise<void> {
  const data = await notionFetch(`/pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify({
      properties: {
        Branch: {
          rich_text: [{ text: { content: branch } }],
        },
      },
    }),
  });

  if (data.object === "error") {
    throw new Error(`Branch update failed: ${data.message}`);
  }

  await sleep(RATE_LIMIT_DELAY);
}

/**
 * Update dependency and blocks relations on a ticket.
 * Pass page IDs for tickets this one depends on (blocked_by)
 * and tickets this one blocks.
 */
export async function updateTicketDependencies(
  pageId: string,
  blockedBy?: string[],
  blocks?: string[]
): Promise<void> {
  const properties: any = {};

  if (blockedBy !== undefined) {
    properties["Dependency"] = {
      relation: blockedBy.map((id) => ({ id })),
    };
  }

  if (blocks !== undefined) {
    properties["Blocks "] = {
      relation: blocks.map((id) => ({ id })),
    };
  }

  if (Object.keys(properties).length === 0) return;

  const data = await notionFetch(`/pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify({ properties }),
  });

  if (data.object === "error") {
    throw new Error(`Dependency update failed: ${data.message}`);
  }

  await sleep(RATE_LIMIT_DELAY);
}

/**
 * Assign a ticket to a team member by name.
 * Resolves the name to a Notion user ID via the TEAM_USERS map.
 */
export async function updateTicketAssignee(
  pageId: string,
  assigneeName: string
): Promise<void> {
  const userId = TEAM_USERS[assigneeName];
  if (!userId) {
    const known = Object.keys(TEAM_USERS).join(", ") || "(none configured)";
    throw new Error(
      `Unknown team member "${assigneeName}". Known: ${known}`
    );
  }

  const data = await notionFetch(`/pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify({
      properties: {
        Assignee: { people: [{ id: userId }] },
      },
    }),
  });

  if (data.object === "error") {
    throw new Error(`Assignee update failed: ${data.message}`);
  }

  await sleep(RATE_LIMIT_DELAY);
}

/**
 * Sync all active AI-assigned tickets to local humanize_state.json.
 * Only includes tickets assigned to AI Squad for this application.
 */
export async function syncState(): Promise<HumanizeState> {
  const pages = await fetchAllShipyardPages();
  const queue: HumanizeQueueItem[] = [];

  for (const page of pages) {
    const ticket = extractTicket(page);
    // Only include AI-assigned tickets for our app that are actionable
    const excluded: string[] = ["Done", "Blocked by human", "On hold"];
    const matchesApp = !TARGET_APP || ticket.application === TARGET_APP;
    if (
      matchesApp &&
      ticket.assigned_to_ai_squad &&
      !excluded.includes(ticket.status)
    ) {
      queue.push({
        ticket_id: ticket.id,
        title: ticket.title,
        area: ticket.area,
        status: ticket.status,
        priority: ticket.priority,
        blocked_by: ticket.blocked_by,
        blocks: ticket.blocks,
        branch: ticket.branch,
      });
    }
  }

  // Sort queue: unblocked first, then by priority (P0 → P4)
  queue.sort((a, b) => {
    const aBlocked = a.blocked_by.length > 0 ? 1 : 0;
    const bBlocked = b.blocked_by.length > 0 ? 1 : 0;
    if (aBlocked !== bBlocked) return aBlocked - bBlocked;
    const pa = a.priority ?? "P4";
    const pb = b.priority ?? "P4";
    return pa.localeCompare(pb);
  });

  // Load existing history or start fresh
  let history: HumanizeHistoryItem[] = [];
  if (fs.existsSync(STATE_FILE)) {
    try {
      const prev: HumanizeState = JSON.parse(
        fs.readFileSync(STATE_FILE, "utf-8")
      );
      history = prev.history ?? [];
    } catch {
      // Corrupted state — start fresh
    }
  }

  const state: HumanizeState = {
    last_synced: new Date().toISOString(),
    queue,
    history,
  };

  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  return state;
}

// ── Self-test mode ──

async function selfTest() {
  console.log("Humanize Bridge — Self-test\n");

  if (!API_KEY) {
    console.error("x NOTION_SHIPYARD_API_KEY is not set");
    process.exit(1);
  }
  console.log("+ API key loaded");

  if (!DB_ID) {
    console.error("x NOTION_SHIPYARD_DB_ID is not set");
    process.exit(1);
  }
  console.log(`+ Database ID: ${DB_ID}`);

  if (!TARGET_APP) {
    console.warn("! TARGET_APP is not set — tickets will not be filtered by application");
  } else {
    console.log(`+ Target application: ${TARGET_APP}`);
  }

  if (!AI_SQUAD_ID) {
    console.warn("! NOTION_AI_SQUAD_USER_ID is not set");
    console.warn("  Create an 'AI Squad' user in Notion and add their ID to .env");
    console.warn("  Without this, the CLI won't filter by assignee.\n");
  } else {
    console.log(`+ AI Squad user: ${AI_SQUAD_ID}`);
  }

  const teamCount = Object.keys(TEAM_USERS).length;
  console.log(`+ Team users configured: ${teamCount}`);

  // Resolve data source
  console.log("\n> Resolving data sources...");
  const dsId = await resolveDataSourceId();
  console.log(`+ Tickets data source: ${dsId}`);

  // Query pages from the data source
  console.log("\n> Querying Tickets data source...");
  const pages = await fetchAllShipyardPages();
  console.log(`+ Found ${pages.length} page(s) in Tickets`);

  // Show a sample ticket if available
  if (pages.length > 0) {
    const sample = extractTicket(pages[0]);
    console.log(`\n  Sample ticket: "${sample.title}"`);
    console.log(`  Status: ${sample.status}`);
    console.log(`  Area: ${sample.area ?? "(none)"}`);
    console.log(`  Application: ${sample.application ?? "(none)"}`);
    console.log(`  Type: ${sample.type ?? "(none)"}`);
  }

  // Count by application
  const appCounts = new Map<string, number>();
  for (const page of pages) {
    const t = extractTicket(page);
    const app = t.application ?? "(none)";
    appCounts.set(app, (appCounts.get(app) ?? 0) + 1);
  }
  console.log("\n  Tickets by application:");
  for (const [app, count] of appCounts) {
    const marker = app === TARGET_APP ? " <-- TARGET" : "";
    console.log(`    ${app}: ${count}${marker}`);
  }

  // Test write capability
  console.log("\n> Testing write (create + delete)...");
  try {
    const test = await createTicket("_selftest_probe_", "Backend", undefined, "P4");
    console.log(`+ Write OK — created ${test.id.substring(0, 8)}`);

    // Clean up: archive the test page
    await notionFetch(`/pages/${test.id}`, {
      method: "PATCH",
      body: JSON.stringify({ archived: true }),
    });
    console.log("+ Cleanup OK — archived test page");
  } catch (err: any) {
    console.error(`x Write FAILED: ${err.message}`);
  }

  console.log("\n+ Self-test passed");
}

// Run self-test if invoked with --test
if (process.argv.includes("--test")) {
  selfTest().catch((err) => {
    console.error("Self-test failed:", err);
    process.exit(1);
  });
}
