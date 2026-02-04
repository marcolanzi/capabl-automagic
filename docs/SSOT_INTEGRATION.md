# SSOT Integration Guide

> **Single Source of Truth Architecture for Capabl Applications**

This guide explains how satellite Capabl applications integrate with **Capabl Core** for centralized authentication and entity management.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CAPABL CORE                                 │
│              (jwatcbscpfviydfweukg.supabase.co)                    │
│                                                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │ auth.users  │  │ core_users  │  │core_vendors │                 │
│  │ (Supabase)  │  │  (SSOT)     │  │   (SSOT)    │                 │
│  └─────────────┘  └─────────────┘  └─────────────┘                 │
│                                                                     │
│  ┌─────────────┐  ┌──────────────────┐                             │
│  │ core_brands │  │core_entity_      │                             │
│  │   (SSOT)    │  │    mappings      │                             │
│  └─────────────┘  └──────────────────┘                             │
│                                                                     │
│  Edge Functions:                                                    │
│  • resolve-entity     - Lookup by id/email/slug/domain             │
│  • create-core-entity - Register new entities                      │
│  • sync-entity        - Update entities across apps                │
│  • init-core-registry - Bootstrap database                         │
└─────────────────────────────────────────────────────────────────────┘
                              │
           ┌──────────────────┼──────────────────┐
           │                  │                  │
           ▼                  ▼                  ▼
    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
    │   Retail    │    │   Future    │    │   Future    │
    │Intelligence │    │    App 2    │    │    App 3    │
    │             │    │             │    │             │
    │ coreAuth    │    │ coreAuth    │    │ coreAuth    │
    │ supabase    │    │ supabase    │    │ supabase    │
    │ (local)     │    │ (local)     │    │ (local)     │
    └─────────────┘    └─────────────┘    └─────────────┘
```

---

## 1. User Authentication

### What It Does
- Users authenticate via **Capabl Core's Supabase Auth**
- Single sign-on across all Capabl applications
- JWT tokens stored in localStorage with key `capabl-core-auth`

### Integration Steps

#### Step 1: Add Environment Variables

Add to your app's `.env`:

```env
# Capabl Core SSOT (Auth + Entity Registry)
VITE_CAPABL_CORE_URL=https://jwatcbscpfviydfweukg.supabase.co
VITE_CAPABL_CORE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3YXRjYnNjcGZ2aXlkZndldWtnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY5MDM1NjIsImV4cCI6MjA3MjQ3OTU2Mn0.PRaIJfylt2gt4uzYplxehJMQ-_Jnefc0Radh9iOeZNY

# For server-side scripts (optional)
CAPABL_CORE_URL=https://jwatcbscpfviydfweukg.supabase.co
CAPABL_CORE_ANON_KEY=<same_key>
```

#### Step 2: Create Core Auth Client

Create `src/integrations/supabase/coreAuth.ts`:

```typescript
/**
 * Capabl Core Auth Client
 *
 * Connects to Capabl Core for authentication.
 * Keep your local supabase client for app-specific data.
 */
import { createClient } from '@supabase/supabase-js';

const CORE_URL = import.meta.env.VITE_CAPABL_CORE_URL
  || "https://jwatcbscpfviydfweukg.supabase.co";
const CORE_ANON_KEY = import.meta.env.VITE_CAPABL_CORE_ANON_KEY
  || "<fallback_key>";

export const hasCoreAuthConfig = !!(CORE_URL && CORE_ANON_KEY);

export const coreAuth = createClient(CORE_URL, CORE_ANON_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'capabl-core-auth', // Separate from local app
  }
});

export default coreAuth;
```

#### Step 3: Update Auth Hook

Modify your `useAuth.ts` to use `coreAuth`:

```typescript
import { coreAuth, hasCoreAuthConfig } from '@/integrations/supabase/coreAuth';

export function useAuth() {
  // ... existing state ...

  useEffect(() => {
    if (!hasCoreAuthConfig) {
      // Fallback to mock mode
      return;
    }

    // Use coreAuth instead of local supabase
    const { data: { subscription } } = coreAuth.auth.onAuthStateChange(
      (_event, session) => {
        setAuthState({
          isAuthenticated: !!session,
          isLoading: false,
          user: session?.user ?? null,
          session,
        });
      }
    );

    coreAuth.auth.getSession().then(({ data: { session } }) => {
      // ... set state ...
    });

    return () => subscription.unsubscribe();
  }, []);

  const logout = useCallback(async () => {
    await coreAuth.auth.signOut();
  }, []);

  return { ...authState, logout };
}

export async function loginWithPassword(email: string, password: string) {
  const { error } = await coreAuth.auth.signInWithPassword({ email, password });
  return { success: !error, error: error?.message };
}

export async function signUp(email: string, password: string) {
  const { error } = await coreAuth.auth.signUp({
    email,
    password,
    options: {
      data: { source_app: 'your-app-name' }
    }
  });
  return { success: !error, error: error?.message };
}
```

#### Step 4: Keep Local Supabase for App Data

Your existing `supabase` client continues to work for app-specific data:

```typescript
// src/integrations/supabase/client.ts - NO CHANGES NEEDED
// This still points to your app's own Supabase project
export const supabase = createClient(LOCAL_URL, LOCAL_ANON_KEY);
```

### Verification

Test login with a Core user:
- Email: `test@capabl.io`
- Password: `testpass123`

Or create a new user via Core's signup.

---

## 2. Entity Management (Vendors, Brands, Users)

### Core Tables

| Table | Purpose |
|-------|---------|
| `core_users` | User profiles (display_name, metadata) |
| `core_vendors` | Vendor registry (name, slug, domain, website) |
| `core_brands` | Brand/Organization registry |
| `core_entity_mappings` | Links Core IDs to app-local IDs |
| `core_referral_lineage` | Tracks user referrals |

### Using the coreMapClient

Install from capabl-automagic or copy `shared/lib/coreMapClient.ts`:

```typescript
import { createCoreMapClient } from '@capabl/automagic';

// Initialize with your app name
const coreMap = createCoreMapClient('retail-intelligence');

// Resolve a vendor by domain or slug
const vendor = await coreMap.resolveVendor('salesforce.com');

// Register a new vendor (creates in Core + mapping to your local ID)
const newVendor = await coreMap.registerVendor(
  { name: 'Acme Corp', domain: 'acme.com', website: 'https://acme.com' },
  'local-vendor-uuid-123'
);

// Resolve by your local app ID
const vendorByLocalId = await coreMap.resolveVendorByLocalId('local-vendor-uuid-123');

// Update a vendor in Core (propagates to all apps)
await coreMap.syncVendor(vendor.id, { description: 'Updated description' });
```

### Edge Function API

Direct API calls if not using the client:

#### Resolve Entity
```bash
POST https://jwatcbscpfviydfweukg.supabase.co/functions/v1/resolve-entity
Authorization: Bearer <anon_or_service_key>
Content-Type: application/json

{
  "entity_type": "vendor",
  "lookup_by": "slug",        # id | email | slug | domain | app_local_id
  "lookup_value": "salesforce",
  "app_name": "your-app"      # Required if lookup_by is app_local_id
}
```

#### Create/Register Entity
```bash
POST https://jwatcbscpfviydfweukg.supabase.co/functions/v1/create-core-entity
Authorization: Bearer <service_key>
Content-Type: application/json

{
  "entity_type": "vendor",
  "data": {
    "name": "Salesforce",
    "domain": "salesforce.com",
    "website": "https://salesforce.com"
  },
  "app_name": "retail-intelligence",
  "app_local_id": "your-local-uuid"
}
```

#### Sync/Update Entity
```bash
POST https://jwatcbscpfviydfweukg.supabase.co/functions/v1/sync-entity
Authorization: Bearer <service_key>
Content-Type: application/json

{
  "entity_type": "vendor",
  "core_id": "uuid-from-core",
  "updates": {
    "description": "New description",
    "website": "https://new-url.com"
  }
}
```

---

## 3. Integration Checklist

### For New Apps

- [ ] Add `VITE_CAPABL_CORE_URL` and `VITE_CAPABL_CORE_ANON_KEY` to `.env`
- [ ] Create `src/integrations/supabase/coreAuth.ts`
- [ ] Update `useAuth.ts` to use `coreAuth` for login/signup/session
- [ ] Keep local `supabase` client for app-specific data
- [ ] Test login with Core credentials
- [ ] (Optional) Integrate `coreMapClient` for entity resolution

### For Entity Integration

- [ ] When creating vendors/brands locally, also register in Core
- [ ] Store `core_vendor_id` or `core_brand_id` in your local table
- [ ] Use `resolveVendor()` before creating duplicates
- [ ] Subscribe to entity updates if needed (future: webhooks)

---

## 4. Two-Client Pattern Summary

| Operation | Client | Supabase Project |
|-----------|--------|------------------|
| Login / Signup | `coreAuth` | Capabl Core |
| Get user session | `coreAuth` | Capabl Core |
| Resolve vendor/brand | `coreAuth` → Edge Function | Capabl Core |
| Register entity in Core | `coreAuth` → Edge Function | Capabl Core |
| App-specific data (cards, articles, etc.) | `supabase` | Your local project |
| App-specific tables | `supabase` | Your local project |

---

## 5. Troubleshooting

### "Invalid credentials" on login
- Ensure user exists in Capabl Core (not your local Supabase)
- Create user via Core signup or API

### "Table not found" errors
- Core tables are in Capabl Core's Supabase, not yours
- Use edge functions for entity operations, not direct table access

### Session not persisting
- Check localStorage key is `capabl-core-auth`
- Verify `persistSession: true` in client config

### Entity not found after creation
- Supabase schema cache may need refresh
- Wait a few seconds or retry

---

## 6. Key Files Reference

### Capabl Core (ref-trust-circle)
```
supabase/
├── migrations/
│   └── 20260203193611_core_registry.sql  # Schema
├── functions/
│   ├── resolve-entity/index.ts           # Lookup
│   ├── create-core-entity/index.ts       # Registration
│   ├── sync-entity/index.ts              # Updates
│   └── init-core-registry/index.ts       # Bootstrap
```

### Capabl Automagic (shared)
```
shared/
├── lib/
│   ├── coreMapClient.ts    # Client library
│   └── index.ts            # Exports
├── types/
│   └── index.ts            # Type definitions
```

### Satellite App (example: Retail Intelligence)
```
src/
├── integrations/
│   └── supabase/
│       ├── client.ts       # Local Supabase (unchanged)
│       └── coreAuth.ts     # Core auth client (new)
├── hooks/
│   └── useAuth.ts          # Uses coreAuth (modified)
```

---

## 7. Future Enhancements

- **Webhooks**: Real-time notifications when Core entities change
- **Offline sync**: Queue entity changes when offline
- **Conflict resolution**: Handle simultaneous updates from multiple apps
- **Audit log**: Track who changed what, when

---

## Questions?

Create a ticket in the Shipyard with tag `Capabl Core` or ask the AI Squad.
