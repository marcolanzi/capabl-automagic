/**
 * Capabl Automagic - Shared Types
 *
 * Type definitions shared across Capabl applications.
 */

// Shipyard types (Notion ticket management)
export * from "./shipyard";

// Re-export core entity types from the client library
export type {
  CoreUser,
  CoreVendor,
  CoreBrand,
  CoreEntity,
  EntityType,
  LookupBy,
  EntityMapping,
  ResolveResult,
  CreateResult,
  SyncResult,
} from "../lib/coreMapClient";
