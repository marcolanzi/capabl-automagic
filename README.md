# Capabl Automagic

**The shared AI development framework for the Capabl ecosystem.**

Automagic provides:
- **AI Agents** — Specialized Claude Code agents for data collection, testing, frontend, backend, and database tasks
- **Humanize Bridge** — Bi-directional sync between CLI and Notion Shipyard (tickets)
- **Design System** — The Capabl design system owned by `frontend-ux-visualizer`

## Quick Start

### 1. Copy to Your Project

```bash
# Clone this repo
git clone https://github.com/marcolanzi/capabl-automagic.git /tmp/automagic

# Copy to your project
cp -r /tmp/automagic/.claude/agents/* /your-project/.claude/agents/
cp -r /tmp/automagic/scripts/* /your-project/scripts/
cp -r /tmp/automagic/shared/types/* /your-project/shared/types/

# Clean up
rm -rf /tmp/automagic
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in:

```env
# Required
NOTION_SHIPYARD_API_KEY=secret_xxx
NOTION_SHIPYARD_DB_ID=xxx-xxx-xxx
TARGET_APP=Your Application Name

# Optional
NOTION_AI_SQUAD_USER_ID=xxx-xxx-xxx
TEAM_USERS={"Marco Lanzi":"72881aba-...","Other Person":"uuid"}
```

### 3. Install Dependencies

```bash
npm install dotenv tsx typescript @types/node
```

### 4. Add Scripts to package.json

```json
{
  "scripts": {
    "humanize": "tsx scripts/humanize.ts",
    "humanize:test": "tsx scripts/notion-bridge.ts --test"
  }
}
```

## Agents

| Agent | Purpose | Color |
|-------|---------|-------|
| `data-collector` | Fetch data from APIs/files → `/data` | Red |
| `e2e-watcher` | Full-stack E2E testing | Orange |
| `frontend-ux-visualizer` | React components + **Capabl Design System** | Yellow |
| `humanize` | Notion ticket sync bridge | Yellow |
| `logic-engine` | Supabase Edge Functions | Green |
| `supabase-architect` | DB schemas, migrations, RLS | Blue |
| `unit-tester` | Granular unit test coverage | Purple |
| `automagic-consistent` | Sync changes to this repo | Cyan |

## Humanize CLI

```bash
# Sync and display queue
npm run humanize

# Poll for open tickets
npm run humanize -- --poll

# Create a ticket
npm run humanize -- --create "Title" --area Frontend --body "Description" --priority P1

# Start work on a ticket (marks In Progress, creates branch)
npm run humanize -- --start <ticket-id>

# Mark ticket done
npm run humanize -- --done <ticket-id>

# Test connectivity
npm run humanize:test
```

## Keeping Apps in Sync

The `automagic-consistent` agent monitors changes to Automagic files. When you modify an agent or script:

1. The agent evaluates if the change is **generic** (benefits all apps) or **app-specific**
2. Generic changes should be **promoted** to this repo
3. Other apps can then **pull** updates from this repo

### Promote Changes

```bash
# From your app, after making a generic improvement:
cd /tmp && git clone https://github.com/marcolanzi/capabl-automagic.git
cp /your-project/.claude/agents/improved-agent.md /tmp/capabl-automagic/.claude/agents/
cd /tmp/capabl-automagic
git add . && git commit -m "Promote: description of change" && git push
```

### Pull Updates

```bash
# In your app, to get latest Automagic:
cd /tmp && git clone https://github.com/marcolanzi/capabl-automagic.git
cp -r /tmp/capabl-automagic/.claude/agents/* /your-project/.claude/agents/
cp /tmp/capabl-automagic/scripts/*.ts /your-project/scripts/
rm -rf /tmp/capabl-automagic
```

## Design System

The `frontend-ux-visualizer` agent owns the **Capabl Design System**, which includes:

- Color palette (Professional Blue theme)
- Typography scale
- Component patterns (Button, Card, Input, Badge, Table, etc.)
- Layout patterns (AdminLayout)
- Spacing, shadows, gradients

This design system is shared across all Capabl apps to ensure visual consistency.

## License

MIT
