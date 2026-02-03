/**
 * Capabl Automagic - Shared Library
 *
 * Core utilities and clients for cross-application functionality.
 */

// Core Map Client - SSOT entity management
export {
  CoreMapClient,
  createCoreMapClient,
  createCoreMapClientWithConfig,
  type CoreUser,
  type CoreVendor,
  type CoreBrand,
  type CoreEntity,
  type EntityType,
  type LookupBy,
  type EntityMapping,
  type ResolveResult,
  type CreateResult,
  type SyncResult,
} from "./coreMapClient";
