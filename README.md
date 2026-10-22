# FaDiMuss

FaDiMuss is an Uzbek-first student study and development assistant. The current MVP includes Firebase email authentication, onboarding, a Firestore-backed goals/tasks planner, a deterministic daily plan, an optional context-limited AI Mentor, server-timed focus sessions, XP/streaks, talent self-assessment, and opt-in Skill Swap profiles and requests.

## Stack

- Next.js App Router, React, TypeScript, Tailwind CSS 4
- Firebase Authentication and Cloud Firestore
- Firebase Admin SDK for trusted focus/task reward and AI routes
- Zod validation, Vitest unit tests, ESLint

## Run locally

Requirements: Node.js 20.9+ and npm.

```sh
npm install
cp .env.example .env.local
# Fill the Firebase web values and server credentials described below.
npm run dev
```

Open `http://localhost:3000`. Without Firebase configuration, the landing page remains available and clearly reports that authentication/data are not configured; the app does not fall back to fake accounts or local-only persistence.

## Firebase setup

1. Create a Firebase project and register a Web app.
2. In Authentication, enable Email/Password.
3. Create the default Cloud Firestore database.
4. Copy the Web app's API key, auth domain, project ID, and app ID into the matching `NEXT_PUBLIC_FIREBASE_*` variables in `.env.local`.
5. Configure Firebase Admin on the server. For local development, set `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` from a service account, or use Application Default Credentials. Keep the private key server-only. Never add service-account JSON to this repository.
6. Deploy rules and indexes: `firebase deploy --only firestore:rules,firestore:indexes`.
7. In Firebase Authentication authorized domains, allow your local and deployed hostnames.

Firebase web values are public client configuration; security comes from Authentication and Firestore Rules, not hiding the web API key. Admin credentials must never use a `NEXT_PUBLIC_` prefix.

## Optional AI Mentor

Set `AI_PROVIDER=openai` and `OPENAI_API_KEY`, or set `AI_PROVIDER=gemini` and `GEMINI_API_KEY`. Keys are read only by the server route. The Mentor supports free-form, multi-turn chat; each request includes up to 10 recent conversation turns, the selected goal titles, at most 30 task summaries, available minutes, and aggregate completion/focus counts. Messages are capped at 2,000 characters; email and profile identity are excluded. Requests time out after 20 seconds. Without a key, the route reports a configuration message and the deterministic planner remains available.

The included per-user limit is six requests per minute per running server instance. For multi-instance/serverless deployments, replace its in-memory store with a shared rate-limit backend before exposing the AI route publicly.

## Planner and scoring

The planner's weighted score is urgency 40%, importance 25%, active-goal alignment 20%, overdue age 10%, and user preference 5%. Deadline buckets and a bounded overdue-age score are implemented in `src/features/planner/priority.ts`. Tasks are sorted deterministically, split into up-to-50-minute blocks, and the scheduled total cannot exceed the user's daily available minutes. Remaining tasks are returned with a deferral reason. The AI provider does not calculate or mutate the plan.

Talent answers use a 1-5 scale and category averages normalize to 0-100. Results are explicitly self-assessment estimates, not diagnoses. Skill Swap requires a complementary teach/learn skill; the score combines complementarity, goal, level, language, and availability fit. Public profiles are opt-in and contain no email/contact fields.

XP is server-written through idempotent `pointEvents`: a task is worth 10 XP once, a verified completed 25-minute focus session 5 XP, and completing at least 60% of the daily scheduled tasks awards a once-per-local-day 15 XP bonus. Focus is capped at 40 XP per local day. Only completed focus sessions and completed tasks update the activity streak; a short break does not. Level thresholds live in `src/features/gamification/points.ts`.

## Data and access

Firestore collections: `users`, `goals`, `tasks`, `focusSessions`, `activeFocus`, `pointEvents`, `talentAssessments`, `skillProfiles`, `publicSkillProfiles`, and `skillSwapRequests`. All timestamps are Firestore timestamps; date-based reward keys use the user's IANA timezone. Queries are owner-filtered in the client and enforced by `firestore.rules`. Focus sessions, active-session records, point events, XP, streak, and reward timestamps are server-managed. Deploy the indexes in `firestore.indexes.json` with the Firebase CLI.

## Checks

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Unit tests cover priority weights and deadlines, time budgeting, talent scoring, skill complementarity/scoring, idempotent reward events, and level progression. Firebase emulator integration tests and browser E2E tests are not included; exercise Auth, Security Rules, and server routes against a non-production Firebase project before deploying.

## Deploy

Deploy the Next.js app to a Node-compatible host (for example, Vercel). Set the same Firebase web configuration as environment variables, configure Admin credentials as encrypted server environment variables or host identity credentials, and set AI variables only if enabling Mentor. Run the Firestore rules/index deployment step above. Then build with `npm run build` and deploy the generated Next.js app. Do not deploy service-account files with the app bundle.

The current interface is Uzbek Latin. Keep future English/Russian copy in message catalogs when adding localization; stored user data and timestamps are locale-independent except for display formatting and timezone-keyed daily activity.