# Monorepo

A full-stack monorepo using pnpm and Turborepo with Next.js, Hono API, Drizzle ORM, and shared domain logic.

## Structure

```
.
├── apps/
│   ├── web/          # Next.js web application
│   └── mobile/       # Mobile application (Expo - placeholder)
├── packages/
│   ├── core/         # Shared domain logic and utilities
│   ├── db/           # Database layer with Drizzle ORM
│   └── api/          # API layer with Hono
└── package.json
```

## Setup

```bash
# Install dependencies
pnpm install

# Run dev servers
pnpm dev

# Build all packages
pnpm build

# Type check all packages
pnpm type-check

# Lint all packages
pnpm lint
```

## Workspace Structure

### Apps

- **web**: Next.js application for web clients
- **mobile**: Mobile application placeholder (Expo to be initialized)

### Packages

- **@monorepo/core**: Shared domain logic, types, and utilities
- **@monorepo/db**: Database layer using Drizzle ORM
- **@monorepo/api**: API layer using Hono framework

## Development

Each package can be developed independently. Use workspace references (`workspace:*`) in package.json for local dependencies.

## Scripts

Root-level scripts run tasks across all workspaces via Turborepo:

- `pnpm dev` - Start development servers
- `pnpm build` - Build all packages
- `pnpm lint` - Lint all packages
- `pnpm type-check` - Type check all packages
