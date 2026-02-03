/**
 * Core Map Client
 *
 * Client library for interacting with the Capabl Core SSOT (Single Source of Truth)
 * entity registry. Allows satellite applications to resolve, register, and sync
 * entities (users, vendors, brands) with the central Core registry.
 *
 * Usage:
 * ```typescript
 * import { createCoreMapClient } from '@capabl/automagic/shared/lib/coreMapClient';
 *
 * const coreMap = createCoreMapClient('retail-intelligence');
 *
 * // Resolve a vendor by domain
 * const vendor = await coreMap.resolveVendor('salesforce.com');
 *
 * // Register a new vendor
 * const newVendor = await coreMap.registerVendor(
 *   { name: 'Acme Corp', domain: 'acme.com' },
 *   'local-vendor-123'
 * );
 * ```
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ============================================================================
// Types
// ============================================================================

export interface CoreUser {
  id: string;
  email: string;
  display_name?: string;
  avatar_url?: string;
  auth_provider: string;
  auth_provider_id?: string;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown>;
}

export interface CoreVendor {
  id: string;
  name: string;
  slug: string;
  domain?: string;
  logo_url?: string;
  description?: string;
  website?: string;
  linkedin_url?: string;
  founded_year?: number;
  employee_range?: string;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown>;
}

export interface CoreBrand {
  id: string;
  name: string;
  slug: string;
  domain?: string;
  logo_url?: string;
  industry?: string;
  company_size?: string;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown>;
}

export type EntityType = "user" | "vendor" | "brand";
export type LookupBy = "id" | "email" | "slug" | "domain" | "app_local_id" | "name";
export type CoreEntity = CoreUser | CoreVendor | CoreBrand;

export interface EntityMapping {
  app_name: string;
  app_local_id: string;
}

export interface ResolveResult<T extends CoreEntity> {
  data: T | null;
  mappings: EntityMapping[];
  error: string | null;
}

export interface CreateResult<T extends CoreEntity> {
  data: T | null;
  mappings: EntityMapping[];
  created: boolean;
  error: string | null;
}

export interface SyncResult<T extends CoreEntity> {
  data: T | null;
  mappings: EntityMapping[];
  affected_apps: string[];
  error: string | null;
}

// ============================================================================
// Core Map Client
// ============================================================================

export class CoreMapClient {
  private supabase: SupabaseClient;
  private appName: string;
  private coreUrl: string;

  constructor(coreUrl: string, coreAnonKey: string, appName: string) {
    this.coreUrl = coreUrl;
    this.appName = appName;
    this.supabase = createClient(coreUrl, coreAnonKey);
  }

  // -------------------------------------------------------------------------
  // Generic Methods
  // -------------------------------------------------------------------------

  /**
   * Resolve an entity by various identifiers
   */
  async resolve<T extends CoreEntity>(
    entityType: EntityType,
    lookupBy: LookupBy,
    lookupValue: string
  ): Promise<ResolveResult<T>> {
    try {
      const { data, error } = await this.supabase.functions.invoke(
        "resolve-entity",
        {
          body: {
            entity_type: entityType,
            lookup_by: lookupBy,
            lookup_value: lookupValue,
            app_name: lookupBy === "app_local_id" ? this.appName : undefined,
          },
        }
      );

      if (error) {
        return { data: null, mappings: [], error: error.message };
      }

      return {
        data: data?.data as T | null,
        mappings: data?.mappings || [],
        error: data?.error || null,
      };
    } catch (err) {
      return {
        data: null,
        mappings: [],
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  /**
   * Register a new entity in Core Map (or link existing one)
   */
  async register<T extends CoreEntity>(
    entityType: EntityType,
    entityData: Partial<T>,
    localId: string
  ): Promise<CreateResult<T>> {
    try {
      const { data, error } = await this.supabase.functions.invoke(
        "create-core-entity",
        {
          body: {
            entity_type: entityType,
            data: entityData,
            app_name: this.appName,
            app_local_id: localId,
          },
        }
      );

      if (error) {
        return { data: null, mappings: [], created: false, error: error.message };
      }

      return {
        data: data?.data as T | null,
        mappings: data?.mappings || [],
        created: data?.created ?? false,
        error: data?.error || null,
      };
    } catch (err) {
      return {
        data: null,
        mappings: [],
        created: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  /**
   * Sync/update an entity in Core Map
   */
  async sync<T extends CoreEntity>(
    entityType: EntityType,
    coreId: string,
    updates: Partial<T>
  ): Promise<SyncResult<T>> {
    try {
      const { data, error } = await this.supabase.functions.invoke(
        "sync-entity",
        {
          body: {
            entity_type: entityType,
            core_id: coreId,
            updates,
            source_app: this.appName,
          },
        }
      );

      if (error) {
        return {
          data: null,
          mappings: [],
          affected_apps: [],
          error: error.message,
        };
      }

      return {
        data: data?.data as T | null,
        mappings: data?.mappings || [],
        affected_apps: data?.affected_apps || [],
        error: data?.error || null,
      };
    } catch (err) {
      return {
        data: null,
        mappings: [],
        affected_apps: [],
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  // -------------------------------------------------------------------------
  // User Convenience Methods
  // -------------------------------------------------------------------------

  /**
   * Resolve a user by email
   */
  async resolveUser(email: string): Promise<CoreUser | null> {
    const result = await this.resolve<CoreUser>("user", "email", email);
    return result.data;
  }

  /**
   * Resolve a user by Core ID
   */
  async resolveUserById(coreId: string): Promise<CoreUser | null> {
    const result = await this.resolve<CoreUser>("user", "id", coreId);
    return result.data;
  }

  /**
   * Resolve a user by local app ID
   */
  async resolveUserByLocalId(localId: string): Promise<CoreUser | null> {
    const result = await this.resolve<CoreUser>("user", "app_local_id", localId);
    return result.data;
  }

  /**
   * Register a user in Core Map
   */
  async registerUser(
    user: Partial<CoreUser>,
    localId: string
  ): Promise<CreateResult<CoreUser>> {
    return this.register<CoreUser>("user", user, localId);
  }

  /**
   * Sync user updates to Core Map
   */
  async syncUser(
    coreId: string,
    updates: Partial<CoreUser>
  ): Promise<SyncResult<CoreUser>> {
    return this.sync<CoreUser>("user", coreId, updates);
  }

  // -------------------------------------------------------------------------
  // Vendor Convenience Methods
  // -------------------------------------------------------------------------

  /**
   * Resolve a vendor by slug or domain
   */
  async resolveVendor(slugOrDomain: string): Promise<CoreVendor | null> {
    // Try slug first
    let result = await this.resolve<CoreVendor>("vendor", "slug", slugOrDomain);
    if (result.data) return result.data;

    // Then try domain
    result = await this.resolve<CoreVendor>("vendor", "domain", slugOrDomain);
    if (result.data) return result.data;

    // Finally try name (fuzzy)
    result = await this.resolve<CoreVendor>("vendor", "name", slugOrDomain);
    return result.data;
  }

  /**
   * Resolve a vendor by Core ID
   */
  async resolveVendorById(coreId: string): Promise<CoreVendor | null> {
    const result = await this.resolve<CoreVendor>("vendor", "id", coreId);
    return result.data;
  }

  /**
   * Resolve a vendor by local app ID
   */
  async resolveVendorByLocalId(localId: string): Promise<CoreVendor | null> {
    const result = await this.resolve<CoreVendor>(
      "vendor",
      "app_local_id",
      localId
    );
    return result.data;
  }

  /**
   * Register a vendor in Core Map
   */
  async registerVendor(
    vendor: Partial<CoreVendor>,
    localId: string
  ): Promise<CreateResult<CoreVendor>> {
    return this.register<CoreVendor>("vendor", vendor, localId);
  }

  /**
   * Sync vendor updates to Core Map
   */
  async syncVendor(
    coreId: string,
    updates: Partial<CoreVendor>
  ): Promise<SyncResult<CoreVendor>> {
    return this.sync<CoreVendor>("vendor", coreId, updates);
  }

  // -------------------------------------------------------------------------
  // Brand Convenience Methods
  // -------------------------------------------------------------------------

  /**
   * Resolve a brand by slug or domain
   */
  async resolveBrand(slugOrDomain: string): Promise<CoreBrand | null> {
    // Try slug first
    let result = await this.resolve<CoreBrand>("brand", "slug", slugOrDomain);
    if (result.data) return result.data;

    // Then try domain
    result = await this.resolve<CoreBrand>("brand", "domain", slugOrDomain);
    if (result.data) return result.data;

    // Finally try name (fuzzy)
    result = await this.resolve<CoreBrand>("brand", "name", slugOrDomain);
    return result.data;
  }

  /**
   * Resolve a brand by Core ID
   */
  async resolveBrandById(coreId: string): Promise<CoreBrand | null> {
    const result = await this.resolve<CoreBrand>("brand", "id", coreId);
    return result.data;
  }

  /**
   * Resolve a brand by local app ID
   */
  async resolveBrandByLocalId(localId: string): Promise<CoreBrand | null> {
    const result = await this.resolve<CoreBrand>("brand", "app_local_id", localId);
    return result.data;
  }

  /**
   * Register a brand in Core Map
   */
  async registerBrand(
    brand: Partial<CoreBrand>,
    localId: string
  ): Promise<CreateResult<CoreBrand>> {
    return this.register<CoreBrand>("brand", brand, localId);
  }

  /**
   * Sync brand updates to Core Map
   */
  async syncBrand(
    coreId: string,
    updates: Partial<CoreBrand>
  ): Promise<SyncResult<CoreBrand>> {
    return this.sync<CoreBrand>("brand", coreId, updates);
  }

  // -------------------------------------------------------------------------
  // Utility Methods
  // -------------------------------------------------------------------------

  /**
   * Get the app name this client is registered with
   */
  getAppName(): string {
    return this.appName;
  }

  /**
   * Get the Core URL
   */
  getCoreUrl(): string {
    return this.coreUrl;
  }

  /**
   * Check if Core is reachable
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Try to resolve a non-existent entity - if we get a proper error response, Core is up
      const result = await this.resolve<CoreUser>(
        "user",
        "id",
        "00000000-0000-0000-0000-000000000000"
      );
      // If we get here without throwing, Core is responsive
      return result.error === null || !result.error.includes("fetch");
    } catch {
      return false;
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a Core Map client for a specific app
 *
 * Requires environment variables:
 * - CAPABL_CORE_URL or VITE_CAPABL_CORE_URL
 * - CAPABL_CORE_ANON_KEY or VITE_CAPABL_CORE_ANON_KEY
 */
export function createCoreMapClient(appName: string): CoreMapClient {
  const coreUrl =
    typeof process !== "undefined"
      ? process.env.CAPABL_CORE_URL || process.env.VITE_CAPABL_CORE_URL
      : // @ts-ignore - Vite env
        import.meta?.env?.VITE_CAPABL_CORE_URL;

  const coreKey =
    typeof process !== "undefined"
      ? process.env.CAPABL_CORE_ANON_KEY || process.env.VITE_CAPABL_CORE_ANON_KEY
      : // @ts-ignore - Vite env
        import.meta?.env?.VITE_CAPABL_CORE_ANON_KEY;

  if (!coreUrl || !coreKey) {
    throw new Error(
      "Missing CAPABL_CORE_URL or CAPABL_CORE_ANON_KEY environment variables. " +
        "Set these to connect to Capabl Core SSOT registry."
    );
  }

  return new CoreMapClient(coreUrl, coreKey, appName);
}

/**
 * Create a Core Map client with explicit configuration
 */
export function createCoreMapClientWithConfig(
  coreUrl: string,
  coreAnonKey: string,
  appName: string
): CoreMapClient {
  return new CoreMapClient(coreUrl, coreAnonKey, appName);
}

// Default export for convenience
export default CoreMapClient;
