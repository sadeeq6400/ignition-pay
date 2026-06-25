# Database Migration Infrastructure & Procedures

## Version Control
- All schema alterations must be made inside `prisma/schema.prisma`.
- Tracking is managed automatically via chronological delta scripts inside the `prisma/migrations/` folder.

## Safe Deployment Steps
1. Adjust models inside `schema.prisma`.
2. Generate and stage the migration locally using a shadow database rule:
   `npx prisma migrate dev --name structural_update_description`
3. Deploy directly to target production/staging environments:
   `npx prisma migrate deploy`

## Rollback & Fail-Safe Strategy
- Prisma migrations are strictly forward-only by default to enforce safe production data management.
- To execute a rollback in a disaster recovery or failure state:
  1. Revert your target model state in `schema.prisma`.
  2. Record a corrective compensation migration path:
     `npx prisma migrate dev --name rollback_previous_change`
  3. If synchronization fails due to manual system variations, clear tracking errors manually with:
     `npx prisma migrate resolve --rolled-back <migration_folder_name>`
