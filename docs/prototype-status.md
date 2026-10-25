# WreckLib — prototype checkpoint (2026-10-25)

## Completed and verified
- Dedicated Supabase project: nwlthntpkmgrhmejhfqk (Free, PostgreSQL 17).
- Applied migrations: wrecklib_initial_schema and wrecklib_prototype_hardening.
- Five application tables with RLS; eleven public policies; one private image bucket.
- RLS grants and image path campaign scope, index coverage and updated_at trigger.
- Browser-facing config uses a public sb_publishable key, never service_role.
- Client paths for /WreckLib/ corrected; invitation query kept through email Magic Link.
- GitHub CI green on commit b5cfc94399107d2229210667e27aba905ce7b60d.
- Deploy workflow exists, but its configure-pages step fails because Pages is disabled.

## External configuration required (one-time)
1. GitHub: https://github.com/f-gav/WreckLib/settings/pages
   Select **Build and deployment → Source → GitHub Actions**.
2. Supabase: https://supabase.com/dashboard/project/nwlthntpkmgrhmejhfqk/auth/url-configuration
   Set Site URL to **https://f-gav.github.io/WreckLib/**
   Add redirect URLs:
   - https://f-gav.github.io/WreckLib/
   - https://f-gav.github.io/WreckLib/**
3. Rerun https://github.com/f-gav/WreckLib/actions/workflows/deploy.yml or push a new commit.

## Required smoke tests before stage 1 can be considered done
- Deployment succeeds and /WreckLib/ loads CSS and JS without 404 errors.
- User signs in through email Magic Link and signs out.
- Create campaign, folder, record, secret notes; reload page; persisted.
- Upload WebP, refresh and read from private storage.
- Invite another verified email (role player); ensure invitation survives auth callback.
- Confirm player cannot view secrets or hidden articles; editor cannot reveal them via REST.
- Check unauthorized anonymous reads/writes are rejected.
- Record test evidence before enabling live use.

## Next sequence after the prototype
Stage 2: reproduce the current WreckTrack look precisely (gold/blue/red/purple themes, fonts, topbar, adaptive components) without changing WreckTrack.
Stage 3+: advanced hierarchy, role tests, Markdown, backlinks, backups, trash and E2E.

## Boundaries
Do not modify WreckTrack or At your service! repositories or databases.
Historical Cloudflare worker and D1 files are not active.
