# apps/web

Standard Next.js 16 App Router project (TypeScript, React).

- **Route groups:** `src/app/(auth)` holds unauthenticated routes (login/register/onboarding); `src/app/(app)` holds the authenticated app shell (home, breathing, device, admin, etc.). Group folders don't affect the URL path.
- **Styling:** Tailwind v4, CSS-first theming — theme tokens are defined with `@theme` in `src/app/globals.css`, not a `tailwind.config.js` theme block.
- **Data fetching:** TanStack Query (`@tanstack/react-query`) for server state; see `src/lib/api.ts` for the API client and `src/lib/useDeviceStream.ts` for the live WebSocket device stream.
- **Forms:** `react-hook-form` + `@hookform/resolvers` for validation.

Follow existing patterns in neighboring files before introducing new ones.
