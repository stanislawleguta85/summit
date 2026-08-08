# create-staff-user

Creates an approved customer or trainer account for the authenticated user's company.
Owners can create both roles. Trainers can create customers, who are automatically assigned to
the trainer selected in the form; the creating trainer is selected by default.

The function must keep JWT verification enabled. It uses the Supabase-provided
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` environment
variables; never copy the service-role key into the Expo app.

Deploy from the repository root after linking the Supabase project:

```sh
npx supabase functions deploy create-staff-user
```

Before deployment, apply `supabase/migrations/20260805_admin_staff_creation.sql` and
`supabase/migrations/20260813_admin_customer_creation.sql`.
Then apply `supabase/migrations/20260814_customer_trainer_selection.sql`.
