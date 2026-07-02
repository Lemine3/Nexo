# Nexo

Nexo is a multi-tenant, multi-store e-commerce platform with WhatsApp
Business Platform integration, granular RBAC, and an AI-augmented CRM/
marketing/support stack.

## Repository layout

```
docs/srs/       The full 16-chapter enterprise Software Requirements
                Specification — the definitive blueprint for the platform.
                Start at docs/srs/00-index.md.
docs/PLATFORM_SPECIFICATION.md
                An earlier, higher-level Arabic feature overview — superseded
                by docs/srs for implementation purposes, kept for reference.
apps/api/       The backend implementation (NestJS + TypeScript + Prisma +
                PostgreSQL). Currently covers Phase 0 (multi-tenancy, auth,
                RBAC) and part of Phase 1 (catalog, inventory, orders) of
                the roadmap in docs/srs/16-implementation-roadmap.md.
                See apps/api/README.md for setup, run, and test instructions.
```

## Where to start

- **Understanding the product/architecture**: [`docs/srs/00-index.md`](docs/srs/00-index.md)
- **Running the code**: [`apps/api/README.md`](apps/api/README.md)
- **What's built vs. not yet built**: [`apps/api/README.md#known-simplifications-vs-the-full-srs`](apps/api/README.md#known-simplifications-vs-the-full-srs)
- **What's next**: [`docs/srs/16-implementation-roadmap.md`](docs/srs/16-implementation-roadmap.md)
