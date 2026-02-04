/**
 * Humanize CLI — Entry Point
 *
 * Bi-directional bridge between CLI and the Shipyard Notion database.
 *
 * Usage:
 *   npm run humanize                                    — Sync and display queue
 *   npm run humanize -- --poll                          — Poll for Open tickets
 *   npm run humanize -- --create "Title" --area Frontend --type Story --body "Details..."  — Create ticket
 *   npm run humanize -- --start <ticket-id>             — Mark In Progress + create branch
 *   npm run humanize -- --done <ticket-id>              — Mark Done + sync state
 *   npm run humanize -- --get <ticket-id>               — Fetch full ticket details
 *
 * Type options: Bug, Task, Story, Epic (default: Story for new features, Bug for fixes)
 */

import * as dotenv from "dotenv";
import { execSync } from "child_process";
import {
  fetchReadyTickets,
  createTicket,
  updateTicketStatus,
  updateTicketBranch,
  updateTicketAssignee,
  syncState,
  fetchTicketDetails,
  type ShipyardType,
} from "./notion-bridge.js";
import type {
  ShipyardArea,
  ShipyardPriority,
  ShipyardStatus,
  HumanizeHistoryItem,
} from "../shared/types/index.js";
import * as fs from "fs";
import * as path from "path";

dotenv.config();

const STATE_FILE = path.resolve(process.cwd(), "humanize_state.json");

const VALID_AREAS: ShipyardArea[] = [
  "Frontend",
  "Backend",
  "Growth",
  "Delivery",
  "Docs",
];

const VALID_PRIORITIES: ShipyardPriority[] = ["P0", "P1", "P2", "P3", "P4"];

const VALID_TYPES: ShipyardType[] = ["Bug", "Task", "Story", "Epic"];

// ── Argument parsing ──

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

// ── Helpers ──

function appendHistory(item: HumanizeHistoryItem): void {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const state = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
      state.history = state.history ?? [];
      state.history.push(item);
      fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    }
  } catch {
    // Non-critical — history will catch up on next sync
  }
}

function shortId(id: string): string {
  return id.replace(/-/g, "").substring(0, 8);
}

// ── Commands ──

async function cmdSync() {
  console.log("~ Syncing Shipyard state...\n");
  const state = await syncState();

  if (state.queue.length === 0) {
    console.log("  Queue is empty — no active tickets for this app.");
    return;
  }

  console.log(`  ${state.queue.length} active ticket(s):\n`);

  // Group by status
  const grouped = new Map<string, typeof state.queue>();
  for (const item of state.queue) {
    const list = grouped.get(item.status) ?? [];
    list.push(item);
    grouped.set(item.status, list);
  }

  const statusOrder: ShipyardStatus[] = [
    "In Progress",
    "In Review",
    "Open",
    "On hold",
    "Blocked by human",
  ];

  for (const status of statusOrder) {
    const items = grouped.get(status);
    if (!items?.length) continue;

    console.log(`  > ${status} (${items.length})`);
    for (const item of items) {
      const pri = item.priority ?? "P4";
      const area = item.area ? ` [${item.area}]` : "";
      const br = item.branch ? ` -> ${item.branch}` : "";
      const blocked = item.blocked_by.length > 0
        ? ` (blocked by ${item.blocked_by.map(shortId).join(", ")})`
        : "";
      const blocking = item.blocks.length > 0
        ? ` (blocks ${item.blocks.map(shortId).join(", ")})`
        : "";
      console.log(`    ${pri} ${shortId(item.ticket_id)}  ${item.title}${area}${br}${blocked}${blocking}`);
    }
    console.log();
  }

  console.log(`  Last synced: ${state.last_synced}`);
}

async function cmdPoll() {
  console.log("~ Polling for Open tickets...\n");
  const tickets = await fetchReadyTickets();

  if (tickets.length === 0) {
    console.log("  No tickets ready for dev.");
    return;
  }

  console.log(`  ${tickets.length} ticket(s) ready:\n`);
  for (const t of tickets) {
    const area = t.area ? ` [${t.area}]` : "";
    const due = t.due ? ` (due ${t.due})` : "";
    const type = t.type ? ` ${t.type}` : "";
    console.log(`  ${shortId(t.id)}${type}  ${t.title}${area}${due}`);
    if (t.summary) console.log(`         ${t.summary}`);
    console.log(`         ID: ${t.id}`);
    console.log();
  }
}

async function cmdCreate() {
  const title = getArg("--create");
  const areaName = getArg("--area");
  const body = getArg("--body");
  const priorityArg = getArg("--priority");
  const assignee = getArg("--assignee");
  const typeArg = getArg("--type");

  if (!title) {
    console.error('x --create requires a title: --create "My ticket title"');
    process.exit(1);
  }

  if (!areaName || !VALID_AREAS.includes(areaName as ShipyardArea)) {
    console.error(
      `x --area is required. Valid: ${VALID_AREAS.join(", ")}`
    );
    process.exit(1);
  }

  if (priorityArg && !VALID_PRIORITIES.includes(priorityArg as ShipyardPriority)) {
    console.error(
      `x Invalid priority. Valid: ${VALID_PRIORITIES.join(", ")}`
    );
    process.exit(1);
  }

  if (typeArg && !VALID_TYPES.includes(typeArg as ShipyardType)) {
    console.error(
      `x Invalid type. Valid: ${VALID_TYPES.join(", ")}`
    );
    process.exit(1);
  }

  const priority = (priorityArg as ShipyardPriority) ?? "P0";
  // Default to Story for new features, can be overridden with --type
  const ticketType = (typeArg as ShipyardType) ?? "Story";
  const assigneeLabel = assignee ? ` -> ${assignee}` : "";

  console.log(`> Creating ticket: "${title}" [${areaName}] ${priority} ${ticketType}${assigneeLabel}`);
  const ticket = await createTicket(
    title,
    areaName as ShipyardArea,
    body,
    priority,
    assignee,
    ticketType
  );

  appendHistory({
    ticket_id: ticket.id,
    title: ticket.title,
    action: "created",
    timestamp: new Date().toISOString(),
  });

  console.log(`+ Created: ${shortId(ticket.id)}`);
  console.log(`  ID: ${ticket.id}`);
  console.log(`  Status: ${ticket.status}`);
}

async function cmdStart() {
  const ticketId = getArg("--start");
  if (!ticketId) {
    console.error("x --start requires a ticket ID");
    process.exit(1);
  }

  console.log(`> Starting ticket ${shortId(ticketId)}...`);

  // 1. Mark In Progress in Notion
  await updateTicketStatus(ticketId, "In Progress");
  console.log("  + Status -> In Progress");

  // 2. Create feature branch
  const branchName = `feature/shipyard-${shortId(ticketId)}`;

  try {
    execSync(`git checkout -b ${branchName}`, { stdio: "pipe" });
    console.log(`  + Branch created: ${branchName}`);
  } catch {
    // Branch might already exist — try switching to it
    try {
      execSync(`git checkout ${branchName}`, { stdio: "pipe" });
      console.log(`  + Switched to existing branch: ${branchName}`);
    } catch (err: any) {
      console.error(`  ! Could not create/switch branch: ${err.message}`);
    }
  }

  // 3. Update branch name in Notion
  await updateTicketBranch(ticketId, branchName);
  console.log("  + Branch synced to Notion");

  appendHistory({
    ticket_id: ticketId,
    title: "(started)",
    action: "started",
    timestamp: new Date().toISOString(),
  });

  // 4. Re-sync state
  await syncState();
  console.log("\n+ Ticket started. You're on branch:", branchName);
}

async function cmdDone() {
  const ticketId = getArg("--done");
  if (!ticketId) {
    console.error("x --done requires a ticket ID");
    process.exit(1);
  }

  console.log(`> Completing ticket ${shortId(ticketId)}...`);

  await updateTicketStatus(ticketId, "Done");
  console.log("  + Status -> Done");

  appendHistory({
    ticket_id: ticketId,
    title: "(done)",
    action: "done",
    timestamp: new Date().toISOString(),
  });

  const state = await syncState();
  console.log(`\n+ Ticket done. ${state.queue.length} ticket(s) remaining.`);
}

async function cmdGet() {
  const ticketId = getArg("--get");
  if (!ticketId) {
    console.error("x --get requires a ticket ID");
    process.exit(1);
  }

  console.log(`> Fetching ticket ${shortId(ticketId)}...\n`);

  const { ticket, description } = await fetchTicketDetails(ticketId);

  console.log(`Title: ${ticket.title}`);
  console.log(`Status: ${ticket.status}`);
  if (ticket.area) console.log(`Area: ${ticket.area}`);
  if (ticket.type) console.log(`Type: ${ticket.type}`);
  if (ticket.priority) console.log(`Priority: ${ticket.priority}`);
  if (ticket.spec_url) console.log(`Spec URL: ${ticket.spec_url}`);
  if (ticket.due) console.log(`Due: ${ticket.due}`);
  if (ticket.branch) console.log(`Branch: ${ticket.branch}`);
  if (ticket.blocked_by.length > 0) {
    console.log(`Blocked by: ${ticket.blocked_by.map(shortId).join(", ")}`);
  }
  if (ticket.blocks.length > 0) {
    console.log(`Blocks: ${ticket.blocks.map(shortId).join(", ")}`);
  }

  console.log(`\nDescription:\n${description || "(no description)"}`);
  console.log(`\nCreated: ${ticket.created_at}`);
  console.log(`Updated: ${ticket.updated_at}`);
}

// ── Main ──

async function main() {
  if (hasFlag("--poll")) {
    await cmdPoll();
  } else if (hasFlag("--create")) {
    await cmdCreate();
  } else if (hasFlag("--start")) {
    await cmdStart();
  } else if (hasFlag("--done")) {
    await cmdDone();
  } else if (hasFlag("--get")) {
    await cmdGet();
  } else {
    await cmdSync();
  }
}

main().catch((err) => {
  console.error("Humanize error:", err.message ?? err);
  process.exit(1);
});
