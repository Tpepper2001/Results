-- Results Management System — Supabase schema
-- Run this once in your Supabase project's SQL Editor (Database > SQL Editor > New query).
-- Safe to re-run: uses "if not exists" / "create or replace" where possible.

create extension if not exists "pgcrypto";

-- ---------- Schools ----------
create table if not exists schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  address text default '',
  phone text default '',
  email text default '',
  session text default '2025/2026',
  term text default '1st Term',
  grading_scale jsonb not null default '[
    {"grade":"A","min":70,"max":100,"remark":"Excellent"},
    {"grade":"B","min":60,"max":69,"remark":"Very Good"},
    {"grade":"C","min":50,"max":59,"remark":"Good"},
    {"grade":"D","min":45,"max":49,"remark":"Fair"},
    {"grade":"E","min":40,"max":44,"remark":"Pass"},
    {"grade":"F","min":0,"max":39,"remark":"Fail"}
  ]'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------- Users (admins & teachers) ----------
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  name text not null default 'User',
  email text not null unique,
  password text not null, -- bcrypt hash
  role text not null check (role in ('admin', 'teacher')),
  created_at timestamptz not null default now()
);

-- ---------- Classes ----------
create table if not exists classes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  name text not null
);

-- ---------- Subjects ----------
create table if not exists subjects (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  name text not null,
  code text default ''
);

-- ---------- Teacher assignments (teacher <-> subject <-> class) ----------
create table if not exists teacher_assignments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  teacher_id uuid not null references users(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  unique (teacher_id, subject_id, class_id)
);

-- ---------- Students ----------
create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  class_id uuid references classes(id) on delete set null,
  name text not null,
  reg_no text not null,
  gender text default '',
  dob date
);

-- ---------- Scores ----------
-- ca1 max 20, ca2 max 20, exam max 60, total max 100 (enforced in application code)
create table if not exists scores (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  class_id uuid references classes(id) on delete set null,
  session text not null,
  term text not null,
  ca1 numeric not null default 0,
  ca2 numeric not null default 0,
  exam numeric not null default 0,
  total numeric not null default 0,
  grade text default '-',
  remark text default '-',
  teacher_id uuid references users(id) on delete set null,
  unique (student_id, subject_id, session, term)
);

-- ---------- Helpful indexes ----------
create index if not exists idx_users_school on users(school_id);
create index if not exists idx_classes_school on classes(school_id);
create index if not exists idx_subjects_school on subjects(school_id);
create index if not exists idx_students_school on students(school_id);
create index if not exists idx_students_class on students(class_id);
create index if not exists idx_scores_school on scores(school_id);
create index if not exists idx_scores_student on scores(student_id);
create index if not exists idx_ta_school on teacher_assignments(school_id);
create index if not exists idx_ta_teacher on teacher_assignments(teacher_id);

-- ---------- Row Level Security ----------
-- This app talks to Supabase using the SERVICE ROLE key from a trusted Node.js
-- server (never exposed to the browser), so it bypasses RLS by design and all
-- access control (school isolation, login, roles) is enforced in the Express
-- app itself. We still enable RLS with no public policies as defense-in-depth,
-- so the tables are inaccessible if the anon/public key is ever used directly.
alter table schools enable row level security;
alter table users enable row level security;
alter table classes enable row level security;
alter table subjects enable row level security;
alter table teacher_assignments enable row level security;
alter table students enable row level security;
alter table scores enable row level security;
-- No policies are created, so only the service_role key (used by the server) can
-- read/write these tables.

-- ==========================================
-- MIGRATION: Psychomotor skills & extended student bio
-- Run this in Supabase SQL Editor if you already ran the first schema.
-- Safe to run on a fresh database too (uses IF NOT EXISTS / IF NOT EXISTS column checks).
-- ==========================================

-- Extended student bio fields (all optional)
alter table students add column if not exists father_name text default '';
alter table students add column if not exists father_phone text default '';
alter table students add column if not exists mother_name text default '';
alter table students add column if not exists mother_phone text default '';
alter table students add column if not exists home_address text default '';
alter table students add column if not exists state_of_origin text default '';
alter table students add column if not exists nationality text default 'Nigerian';
alter table students add column if not exists religion text default '';
alter table students add column if not exists blood_group text default '';
alter table students add column if not exists genotype text default '';
alter table students add column if not exists previous_school text default '';

-- Form teacher assignment: one teacher per class per school
create table if not exists form_teacher_assignments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  teacher_id uuid not null references users(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  unique (school_id, class_id)
);

create index if not exists idx_fta_school on form_teacher_assignments(school_id);
create index if not exists idx_fta_teacher on form_teacher_assignments(teacher_id);
create index if not exists idx_fta_class on form_teacher_assignments(class_id);

alter table form_teacher_assignments enable row level security;

-- Psychomotor scores
-- rating: 1=Poor, 2=Fair, 3=Good, 4=Very Good, 5=Excellent (Nigerian standard)
create table if not exists psychomotor_scores (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  class_id uuid references classes(id) on delete set null,
  session text not null,
  term text not null,
  handwriting integer check (handwriting between 1 and 5),
  drawing integer check (drawing between 1 and 5),
  sports integer check (sports between 1 and 5),
  musical_ability integer check (musical_ability between 1 and 5),
  practical_skills integer check (practical_skills between 1 and 5),
  verbal_fluency integer check (verbal_fluency between 1 and 5),
  creativity integer check (creativity between 1 and 5),
  form_teacher_comment text default '',
  entered_by uuid references users(id) on delete set null,
  unique (student_id, session, term)
);

create index if not exists idx_psycho_school on psychomotor_scores(school_id);
create index if not exists idx_psycho_student on psychomotor_scores(student_id);

alter table psychomotor_scores enable row level security;

-- ==========================================
-- MIGRATION: Attendance, remarks, school logo
-- Run this in Supabase SQL Editor. Safe to re-run.
-- ==========================================

-- School logo + attendance total for the term
alter table schools add column if not exists logo_url text default '';
alter table schools add column if not exists days_open integer default 0;

-- Per-student attendance + principal's remark, alongside psychomotor skills
-- (one row per student per session/term already exists in psychomotor_scores)
alter table psychomotor_scores add column if not exists times_present integer default 0;
alter table psychomotor_scores add column if not exists times_absent integer default 0;
alter table psychomotor_scores add column if not exists principal_remark text default '';

-- Storage bucket for school logos (public read, so logos display on printed
-- result sheets without needing signed URLs). Uploads only happen server-side
-- via the service_role key, which bypasses storage policies, so no extra
-- policy is required.
insert into storage.buckets (id, name, public)
values ('school-logos', 'school-logos', true)
on conflict (id) do nothing;

-- ==========================================
-- MIGRATION: Customizable assessment structure, "Not Offering" flag,
-- form teachers adding students / grading unassigned subjects.
-- Run this in Supabase SQL Editor. Safe to re-run.
-- ==========================================

-- Per-school customizable assessment structure: 1-3 CA components + exactly
-- 1 Exam component, whose max scores must sum to 100. Validated in the app
-- (see utils/grading.js validateAssessmentStructure) before being saved here.
alter table schools add column if not exists assessment_structure jsonb not null default '[
  {"key":"ca1","label":"1st CA","type":"ca","max":20},
  {"key":"ca2","label":"2nd CA","type":"ca","max":20},
  {"key":"exam","label":"Exam","type":"exam","max":60}
]'::jsonb;

-- Dynamic score components (e.g. {"ca1": 18, "ca2": 17, "exam": 55}) replacing
-- the old fixed ca1/ca2/exam columns (which remain for backward compatibility
-- but are no longer written to). "not_offering" lets a subject teacher mark a
-- student as not taking that subject, excluding them from that subject's
-- rows in totals/averages/ranking.
alter table scores add column if not exists components jsonb not null default '{}'::jsonb;
alter table scores add column if not exists not_offering boolean not null default false;
