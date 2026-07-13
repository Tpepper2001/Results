# School Results Management System

A simple, self-contained web app for managing school results, backed by
**Supabase (Postgres)**. Any number of schools can register, configure
themselves, register students, add subject teachers, and let those teachers
enter scores. Totals, grades and printable result sheets are generated
automatically.

## Features

- **School registration & configuration** — any school can sign up and get a unique
  school code, an administrator account, and an editable grading scale.
- **Student registration** — admins register students into classes with a name,
  registration number (auto-generated if left blank), gender and date of birth.
- **Teacher registration & subject/class assignment** — admins register subject
  teachers and assign each one to a subject + class combination.
- **Score entry** — subject teachers log in and enter **1st CA (max 20)**,
  **2nd CA (max 20)** and **Exam (max 60)** for every student in their assigned
  class. The total (max 100) and letter grade are calculated automatically.
- **Automatic results** — a printable result sheet is generated per student, per
  session/term, showing every subject, totals, average, grade, remarks and the
  student's position in class.
- **Multi-school** — the system supports multiple independent schools, each fully
  isolated by school code (a simple multi-tenant setup).

## Tech stack

- Node.js + Express
- EJS templates + Bootstrap 5 (via CDN)
- **Supabase** (hosted Postgres) as the database, accessed via `@supabase/supabase-js`
  from the server using the **service_role** key.

## 1. Set up Supabase

1. Create a free project at [supabase.com](https://supabase.com).
2. In your project, go to **SQL Editor > New query**, paste the contents of
   [`supabase/schema.sql`](./supabase/schema.sql), and run it. This creates all
   the tables (`schools`, `users`, `classes`, `subjects`, `teacher_assignments`,
   `students`, `scores`) with the right relationships and indexes.
3. Go to **Project Settings > API** and copy:
   - **Project URL** → `SUPABASE_URL`
   - **service_role secret key** → `SUPABASE_SERVICE_KEY` (not the `anon`
     public key — the service_role key is what lets the server read/write on
     behalf of every school; never expose it to the browser or commit it to git)

## 2. Run locally

```bash
git clone <this-repo-url>
cd results-system
npm install
cp .env.example .env    # fill in SUPABASE_URL, SUPABASE_SERVICE_KEY, and SESSION_SECRET
npm start
```

The app runs at `http://localhost:3000` by default (set `PORT` in `.env` to change it).

## First-time use

1. Go to `/register-school` and register your school. You'll receive a **school
   code** — save it, it's required (together with email/password) for every login
   at your school.
2. Log in as the administrator and:
   - Add **classes** (e.g. JSS1A, Primary 5) under *Classes*.
   - Add **subjects** (e.g. Mathematics, English Language) under *Subjects*.
   - Register **students** into classes under *Students*.
   - Register **teachers** and assign each one to a subject + class under
     *Teachers*.
   - Adjust the **session/term** and **grading scale** under *School
     Configuration* if needed.
3. Give teachers their login details (school code + their email + password).
   Teachers log in at `/login`, pick a subject/class assignment, and enter 1st CA,
   2nd CA and Exam scores for each student.
4. View or print any student's result from *Results* (admin) or from a student's
   row (teacher, for classes they teach).

## Project structure

```
server.js               Express app entry point
db/supabase.js           Supabase client (service_role key, server-side only)
supabase/schema.sql       Postgres schema — run once in the Supabase SQL Editor
middleware/auth.js        Login/role-guard middleware
routes/auth.js             Landing page, school registration, login/logout
routes/admin.js            Config, classes, subjects, students, teachers, results
routes/teacher.js          Teacher dashboard + score entry
routes/results.js          Printable result sheet
utils/grading.js           Score weighting (20/20/60) and grade calculation
utils/mappers.js           Converts Postgres snake_case rows to the camelCase views expect
utils/asyncHandler.js      Wraps async routes so DB errors are caught cleanly
views/                     EJS templates (admin/, teacher/, results/, partials/)
public/css/style.css       Styling
```

## Deploying

This is a standard Node/Express app and can be deployed to any Node host
(Render, Railway, Fly.io, a VPS, etc.) — no persistent disk is needed since all
data lives in Supabase:

1. Push this repository to GitHub.
2. On your host, set the build command to `npm install` and the start command to
   `npm start`.
3. Set environment variables: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`,
   `SESSION_SECRET`, and optionally `PORT` (most hosts set this automatically).
4. That's it — since Supabase is already persistent and hosted, you don't need
   to worry about disks/volumes for the database.

## Security notes for production

- Passwords are hashed with bcrypt before being stored in the `users` table.
- The `SUPABASE_SERVICE_KEY` bypasses Row Level Security by design (it's how the
  trusted server reads/writes across all schools) — it must **only** live in
  your server's environment variables, never in client-side code or git.
  `supabase/schema.sql` enables RLS with no public policies as defense-in-depth,
  so the anon/public key alone cannot read or write anything.
- Sessions currently use the default in-memory store, which is fine for a single
  small instance but does not scale across multiple server processes/restarts.
  For production with multiple instances, use a persistent session store (e.g.
  `connect-redis` or a database-backed store).
- Set a strong, unique `SESSION_SECRET` in production.

## License

MIT — do whatever you like with this, no warranty provided.
