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
