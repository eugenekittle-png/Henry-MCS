Create a new Henry MCS feature called: $ARGUMENTS

Work through each section below in order. Check off each item as it is completed. Do not skip items — these are the baseline requirements for every feature in this codebase.

---

## 1. Clarify scope (ask before writing any code)

- What does this feature do in one sentence?
- Does it consume AI tokens? (determines if it's billable)
- Is it user-facing (all staff) or admin-only?
- Does it need client/matter context?
- Does it need its own DB table(s)?

---

## 2. Page registration

- [ ] Add entry to `ALL_PAGES` in `src/lib/pages.ts` with a `key`, `label`, and `group` ("tools" or "reporting")
- [ ] Decide which default group(s) get access and add the key to `STAFF_DEFAULT_PAGES`, `BILLING_DEFAULT_PAGES`, or `SECURITY_DEFAULT_PAGES` as appropriate (or leave out if admin-only)

---

## 3. Database (if new tables or columns are needed)

- [ ] Add `CREATE TABLE IF NOT EXISTS` block inside `ensureInit()` in `src/lib/db.ts`
- [ ] Any future column additions use the try/catch `ALTER TABLE` migration pattern (never modify the original CREATE TABLE after deploy)
- [ ] Export CRUD functions from `src/lib/db.ts`

---

## 4. API routes (`src/app/api/<feature>/route.ts`)

Every route handler must have — in this order:

- [ ] `import { getSession } from "@/lib/auth"` (or `getSessionFromRequest` for routes that receive a `Request` param)
- [ ] `import { hasPage } from "@/lib/auth"`
- [ ] Session check: `const session = await getSession(); if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });`
- [ ] Permission check: `if (!hasPage(session, "<key>")) return Response.json({ error: "Forbidden" }, { status: 403 });`
- [ ] `insertAuditLog()` call on every meaningful action (create, update, delete, AI call) with `clientNumber`, `matterNumber`, `tokensInput`, `tokensOutput` populated where applicable
- [ ] If the feature calls the AI and consumes tokens, add the action string to `BILLABLE_ACTIONS` in `src/lib/db.ts`

---

## 5. Page component (`src/app/<feature>/page.tsx`)

- [ ] Import `useAuth` and `useRouter`
- [ ] Add redirect guard at the top of the component:
  ```typescript
  const { user } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (user && user.role !== "admin" && !user.pages.includes("<key>")) {
      router.replace("/");
    }
  }, [user, router]);
  ```
- [ ] Include client/matter picker if the feature operates in matter context

---

## 6. Navigation

- [ ] Add link in `src/components/Navbar.tsx` (user nav or admin dropdown as appropriate)
- [ ] If admin-only, add the path to `ADMIN_PATHS` in `src/proxy.ts`

---

## 7. Help page

- [ ] Add an entry to `TOOL_SECTIONS` in `src/app/help/page.tsx` if this is a user-facing tool
- [ ] Wrap the help section with `{canSee("<key>") && <Section ...>}`

---

## 8. AI system prompt (if applicable)

- [ ] Add a `<FEATURE>_SYSTEM_PROMPT` constant to `src/lib/constants.ts` following the existing format (document injection guard, citation format, no emojis)

---

## 9. Verify

- [ ] Kill and restart the dev server if needed (`taskkill //F //IM node.exe` then `npm run dev`) to clear any stale Next.js cache
- [ ] Navigate to the feature as a non-admin user without the page assigned — confirm redirect to `/`
- [ ] Call the API route without a session cookie — confirm 401
- [ ] Call the API route with a session but without the page permission — confirm 403
- [ ] Perform an action and confirm a row appears in the audit log
