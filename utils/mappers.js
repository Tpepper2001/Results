function mapSchool(row) {
  if (!row) return null;
  return {
    id: row.id, name: row.name, code: row.code, address: row.address,
    phone: row.phone, email: row.email, session: row.session, term: row.term,
    gradingScale: row.grading_scale, createdAt: row.created_at,
    logoUrl: row.logo_url || '', daysOpen: row.days_open || 0,
    assessmentStructure: (row.assessment_structure && row.assessment_structure.length) ? row.assessment_structure : null
  };
}

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id, schoolId: row.school_id, name: row.name, email: row.email,
    password: row.password, role: row.role, createdAt: row.created_at
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
    id: row.id, schoolId: row.school_id, teacherId: row.teacher_id,
    subjectId: row.subject_id, classId: row.class_id
  };
}

function mapFormTeacherAssignment(row) {
  if (!row) return null;
  return {
    id: row.id, schoolId: row.school_id, teacherId: row.teacher_id, classId: row.class_id
  };
}

function mapStudent(row) {
  if (!row) return null;
  return {
    id: row.id, schoolId: row.school_id, classId: row.class_id,
    name: row.name, regNo: row.reg_no, gender: row.gender, dob: row.dob,
    fatherName: row.father_name || '', fatherPhone: row.father_phone || '',
    motherName: row.mother_name || '', motherPhone: row.mother_phone || '',
    homeAddress: row.home_address || '', stateOfOrigin: row.state_of_origin || '',
    nationality: row.nationality || 'Nigerian', religion: row.religion || '',
    bloodGroup: row.blood_group || '', genotype: row.genotype || '',
    previousSchool: row.previous_school || ''
  };
}

function mapScore(row) {
  if (!row) return null;
  return {
    id: row.id, schoolId: row.school_id, studentId: row.student_id,
    subjectId: row.subject_id, classId: row.class_id,
    session: row.session, term: row.term,
    components: row.components || {}, total: Number(row.total),
    grade: row.grade, remark: row.remark, teacherId: row.teacher_id,
    notOffering: !!row.not_offering
  };
}

function mapPsychomotor(row) {
  if (!row) return null;
  return {
    id: row.id, schoolId: row.school_id, studentId: row.student_id,
    classId: row.class_id, session: row.session, term: row.term,
    handwriting: row.handwriting, drawing: row.drawing, sports: row.sports,
    musicalAbility: row.musical_ability, practicalSkills: row.practical_skills,
    verbalFluency: row.verbal_fluency, creativity: row.creativity,
    formTeacherComment: row.form_teacher_comment || '', enteredBy: row.entered_by,
    timesPresent: row.times_present || 0, timesAbsent: row.times_absent || 0,
    principalRemark: row.principal_remark || ''
  };
}

// Nigerian standard psychomotor rating scale
const PSYCHOMOTOR_RATING = {
  5: 'Excellent', 4: 'Very Good', 3: 'Good', 2: 'Fair', 1: 'Poor'
};

const PSYCHOMOTOR_SKILLS = [
  { key: 'handwriting',      label: 'Handwriting' },
  { key: 'drawing',          label: 'Drawing / Painting' },
  { key: 'sports',           label: 'Sports / Physical Activity' },
  { key: 'musical_ability',  label: 'Musical Ability' },
  { key: 'practical_skills', label: 'Practical / Lab Skills' },
  { key: 'verbal_fluency',   label: 'Verbal Fluency' },
  { key: 'creativity',       label: 'Creativity' }
];

module.exports = {
  mapSchool, mapUser, mapClass, mapSubject, mapAssignment,
  mapFormTeacherAssignment, mapStudent, mapScore, mapPsychomotor,
  PSYCHOMOTOR_RATING, PSYCHOMOTOR_SKILLS
};
