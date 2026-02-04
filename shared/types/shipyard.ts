/**
 * Shipyard Types — Humanize Bridge
 *
 * Type definitions for the Capabl OS Shipyard (Notion Tickets) integration.
 * These types are shared across all Capabl applications that use the Humanize bridge.
 */

export type ShipyardStatus = 'Open' | 'In Progress' | 'On hold' | 'In Review' | 'Review AI Fix' | 'Done' | 'Blocked by human';

export type ShipyardArea = 'Frontend' | 'Backend' | 'Growth' | 'Delivery' | 'Docs';

export type ShipyardPriority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4';

export interface ShipyardTicket {
  id: string;
  title: string;
  status: ShipyardStatus;
  summary: string | null;
  spec_url: string | null;
  due: string | null;
  branch: string | null;
  commit: string | null;
  feature: string | null;
  resolved_at: string | null;
  area: ShipyardArea | null;
  application: string | null;
  type: string | null;
  priority: ShipyardPriority | null;
  blocked_by: string[];
  blocks: string[];
  created_at: string;
  updated_at: string;
}

export interface HumanizeQueueItem {
  ticket_id: string;
  title: string;
  area: ShipyardArea | null;
  status: ShipyardStatus;
  priority: ShipyardPriority | null;
  blocked_by: string[];
  blocks: string[];
  branch: string | null;
}

export interface HumanizeHistoryItem {
  ticket_id: string;
  title: string;
  action: 'created' | 'started' | 'done' | 'status_change';
  timestamp: string;
}

export interface HumanizeState {
  last_synced: string;
  queue: HumanizeQueueItem[];
  history: HumanizeHistoryItem[];
}
