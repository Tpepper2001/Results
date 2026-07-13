// Supabase/Postgres returns snake_case column names. The EJS views were
// written against camelCase objects, so these small mappers translate rows
// coming back from the database into the shape the views already expect.
// (Inserts/updates build their own snake_case objects directly in the routes.)

function mapSchool(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    address: row.address,
    phone: row.phone,
    email: row.email,
    session: row.session,
    term: row.term,
    gradingScale: row.grading_scale,
    createdAt: row.created_at
  };
}

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    schoolId: row.school_id,
    name: row.name,
    email: row.email,
    password: row.password,
    role: row.role,
    createdAt: row.created_at
  };
}

function mapClass(row) {
  if (!row) return null;
  return { id: row.id, schoolId: row.school_id, name: row.name };
}

function mapSubject(row) {
  if (!row) return null;
  return { id: row.id, schoolId: row.school_id, name: row.name, code: row.code };
}

function mapAssignment(row) {
  if (!row) return null;
  return {
    id: row.id,
    schoolId: row.school_id,
    teacherId: row.teacher_id,
    subjectId: row.subject_id,
    classId: row.class_id
  };
}

function mapStudent(row) {
  if (!row) return null;
  return {
    id: row.id,
    schoolId: row.school_id,
    classId: row.class_id,
    name: row.name,
    regNo: row.reg_no,
    gender: row.gender,
    dob: row.dob
  };
}

function mapScore(row) {
  if (!row) return null;
  return {
    id: row.id,
    schoolId: row.school_id,
    studentId: row.student_id,
    subjectId: row.subject_id,
    classId: row.class_id,
    session: row.session,
    term: row.term,
    ca1: Number(row.ca1),
    ca2: Number(row.ca2),
    exam: Number(row.exam),
    total: Number(row.total),
    grade: row.grade,
    remark: row.remark,
    teacherId: row.teacher_id
  };
}

module.exports = {
  mapSchool, mapUser, mapClass, mapSubject, mapAssignment, mapStudent, mapScore
};
