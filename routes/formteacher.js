const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');
const asyncHandler = require('../utils/asyncHandler');
const { requireLogin } = require('../middleware/auth');
const { DEFAULT_ASSESSMENT_STRUCTURE } = require('../utils/grading');
const { buildScoreRows } = require('../utils/scoreHelpers');
const {
  mapClass, mapStudent, mapPsychomotor, mapSubject, mapScore,
  PSYCHOMOTOR_SKILLS, PSYCHOMOTOR_RATING
} = require('../utils/mappers');

router.use(requireLogin);

async function getFormTeacherClass(schoolId, teacherId) {
  const { data, error } = await supabase.from('form_teacher_assignments')
    .select('*').eq('school_id', schoolId).eq('teacher_id', teacherId).maybeSingle();
  if (error) throw error;
  return data || null;
}

// ---------- Add / list students in the form teacher's class ----------
router.get('/students', asyncHandler(async (req, res) => {
  const schoolId = req.session.school.id;
  const teacherId = req.session.user.id;

  const fta = await getFormTeacherClass(schoolId, teacherId);
  if (!fta) {
    req.flash('error', 'You are not assigned as a form teacher for any class.');
    return res.redirect('/teacher');
  }

  const [{ data: studentRows, error: stErr }, { data: clsRow, error: clsErr }] = await Promise.all([
    supabase.from('students').select('*').eq('school_id', schoolId).eq('class_id', fta.class_id).order('name'),
    supabase.from('classes').select('*').eq('id', fta.class_id).single()
  ]);
  if (stErr) throw stErr;
  if (clsErr) throw clsErr;

  res.render('formteacher/students', {
    students: (studentRows || []).map(mapStudent),
    cls: mapClass(clsRow)
  });
}));

router.post('/students', asyncHandler(async (req, res) => {
  const schoolId = req.session.school.id;
  const teacherId = req.session.user.id;

  const fta = await getFormTeacherClass(schoolId, teacherId);
  if (!fta) {
    req.flash('error', 'You are not assigned as a form teacher for any class.');
    return res.redirect('/teacher');
  }

  const {
    name, regNo, gender, dob,
    fatherName, fatherPhone, motherName, motherPhone,
    homeAddress, stateOfOrigin, nationality, religion,
    bloodGroup, genotype, previousSchool
  } = req.body;

  if (!name) {
    req.flash('error', 'Student name is required.');
    return res.redirect('/formteacher/students');
  }
  const finalRegNo = (regNo && regNo.trim()) || ('STU' + Math.floor(10000 + Math.random() * 89999));

  const { error } = await supabase.from('students').insert({
    school_id: schoolId, name: name.trim(), reg_no: finalRegNo,
    class_id: fta.class_id, // always forced to the form teacher's own class
    gender: gender || '', dob: dob || null,
    father_name: fatherName || '', father_phone: fatherPhone || '',
    mother_name: motherName || '', mother_phone: motherPhone || '',
    home_address: homeAddress || '', state_of_origin: stateOfOrigin || '',
    nationality: nationality || 'Nigerian', religion: religion || '',
    blood_group: bloodGroup || '', genotype: genotype || '',
    previous_school: previousSchool || ''
  });
  if (error) throw error;

  req.flash('success', `Student "${name}" registered with reg. no. ${finalRegNo}.`);
  res.redirect('/formteacher/students');
}));

// ---------- Grade a subject that has no subject teacher assigned ----------
router.get('/scores/:subjectId', asyncHandler(async (req, res) => {
  const schoolId = req.session.school.id;
  const teacherId = req.session.user.id;
  const school = req.session.school;
  const subjectId = req.params.subjectId;

  const fta = await getFormTeacherClass(schoolId, teacherId);
  if (!fta) {
    req.flash('error', 'You are not assigned as a form teacher for any class.');
    return res.redirect('/teacher');
  }

  const { data: existingAssignment } = await supabase.from('teacher_assignments')
    .select('id').eq('school_id', schoolId).eq('class_id', fta.class_id).eq('subject_id', subjectId).maybeSingle();
  if (existingAssignment) {
    req.flash('error', 'This subject already has a subject teacher assigned. Ask your administrator if you need access.');
    return res.redirect('/teacher');
  }

  const [
    { data: studentRows, error: stErr },
    { data: clsRow, error: clsErr },
    { data: subjRow, error: subjErr },
    { data: scoreRows, error: scErr }
  ] = await Promise.all([
    supabase.from('students').select('*').eq('school_id', schoolId).eq('class_id', fta.class_id).order('name'),
    supabase.from('classes').select('*').eq('id', fta.class_id).single(),
    supabase.from('subjects').select('*').eq('id', subjectId).single(),
    supabase.from('scores').select('*').eq('school_id', schoolId).eq('subject_id', subjectId).eq('class_id', fta.class_id).eq('session', school.session).eq('term', school.term)
  ]);
  if (stErr) throw stErr; if (clsErr) throw clsErr; if (subjErr) throw subjErr; if (scErr) throw scErr;

  const cls = mapClass(clsRow);
  const structure = cls.assessmentStructure || DEFAULT_ASSESSMENT_STRUCTURE;

  const students = (studentRows || []).map(mapStudent);
  const scores = (scoreRows || []).map(mapScore);
  const existingScores = {};
  students.forEach(st => {
    const sc = scores.find(s => s.studentId === st.id);
    existingScores[st.id] = sc || { components: {}, total: 0, notOffering: false };
  });

  res.render('teacher/scores', {
    students, cls, subject: mapSubject(subjRow),
    classId: fta.class_id, subjectId, existingScores, structure,
    postAction: `/formteacher/scores/${subjectId}`
  });
}));

router.post('/scores/:subjectId', asyncHandler(async (req, res) => {
  const schoolId = req.session.school.id;
  const teacherId = req.session.user.id;
  const school = req.session.school;
  const subjectId = req.params.subjectId;
  const { studentIds } = req.body;

  const fta = await getFormTeacherClass(schoolId, teacherId);
  if (!fta) {
    req.flash('error', 'You are not assigned as a form teacher for any class.');
    return res.redirect('/teacher');
  }

  const { data: existingAssignment } = await supabase.from('teacher_assignments')
    .select('id').eq('school_id', schoolId).eq('class_id', fta.class_id).eq('subject_id', subjectId).maybeSingle();
  if (existingAssignment) {
    req.flash('error', 'This subject already has a subject teacher assigned.');
    return res.redirect('/teacher');
  }

  const { data: clsRow, error: clsErr } = await supabase.from('classes').select('*').eq('id', fta.class_id).single();
  if (clsErr) throw clsErr;
  const structure = mapClass(clsRow).assessmentStructure || DEFAULT_ASSESSMENT_STRUCTURE;
  const ids = [].concat(studentIds || []);
  const notOfferingIds = new Set([].concat(req.body.notOfferingIds || []));

  const rows = buildScoreRows({
    structure, ids, body: req.body, notOfferingIds,
    schoolId, subjectId, classId: fta.class_id, session: school.session, term: school.term,
    teacherId, gradingScale: school.gradingScale
  });

  if (rows.length) {
    const { error } = await supabase.from('scores').upsert(rows, { onConflict: 'student_id,subject_id,session,term' });
    if (error) throw error;
  }

  req.flash('success', 'Scores saved successfully.');
  res.redirect(`/formteacher/scores/${subjectId}`);
}));

// ---------- Psychomotor + attendance entry ----------
router.get('/psychomotor', asyncHandler(async (req, res) => {
  const schoolId = req.session.school.id;
  const teacherId = req.session.user.id;
  const school = req.session.school;

  const fta = await getFormTeacherClass(schoolId, teacherId);
  if (!fta) {
    req.flash('error', 'You are not assigned as a form teacher for any class.');
    return res.redirect('/teacher');
  }

  const [{ data: studentRows, error: stErr }, { data: clsRow, error: clsErr }, { data: psychoRows, error: psErr }] = await Promise.all([
    supabase.from('students').select('*').eq('school_id', schoolId).eq('class_id', fta.class_id).order('name'),
    supabase.from('classes').select('*').eq('id', fta.class_id).single(),
    supabase.from('psychomotor_scores').select('*').eq('school_id', schoolId).eq('class_id', fta.class_id).eq('session', school.session).eq('term', school.term)
  ]);
  if (stErr) throw stErr;
  if (clsErr) throw clsErr;
  if (psErr) throw psErr;

  const students = (studentRows || []).map(mapStudent);
  const existingMap = {};
  (psychoRows || []).forEach(p => { existingMap[p.student_id] = mapPsychomotor(p); });

  res.render('formteacher/psychomotor', {
    students, cls: mapClass(clsRow), existingMap,
    skills: PSYCHOMOTOR_SKILLS, rating: PSYCHOMOTOR_RATING, school
  });
}));

router.post('/psychomotor', asyncHandler(async (req, res) => {
  const schoolId = req.session.school.id;
  const teacherId = req.session.user.id;
  const school = req.session.school;

  const fta = await getFormTeacherClass(schoolId, teacherId);
  if (!fta) {
    req.flash('error', 'You are not assigned as a form teacher for any class.');
    return res.redirect('/teacher');
  }

  const { studentIds, handwriting, drawing, sports, musical_ability,
    practical_skills, verbal_fluency, creativity, form_teacher_comment,
    times_present, times_absent } = req.body;

  const ids = [].concat(studentIds || []);
  const hw = [].concat(handwriting || []);
  const dr = [].concat(drawing || []);
  const sp = [].concat(sports || []);
  const ma = [].concat(musical_ability || []);
  const ps = [].concat(practical_skills || []);
  const vf = [].concat(verbal_fluency || []);
  const cr = [].concat(creativity || []);
  const comments = [].concat(form_teacher_comment || []);
  const present = [].concat(times_present || []);
  const absent = [].concat(times_absent || []);

  const rows = ids.map((studentId, i) => ({
    school_id: schoolId,
    student_id: studentId,
    class_id: fta.class_id,
    session: school.session,
    term: school.term,
    handwriting: Number(hw[i]) || null,
    drawing: Number(dr[i]) || null,
    sports: Number(sp[i]) || null,
    musical_ability: Number(ma[i]) || null,
    practical_skills: Number(ps[i]) || null,
    verbal_fluency: Number(vf[i]) || null,
    creativity: Number(cr[i]) || null,
    form_teacher_comment: comments[i] || '',
    times_present: Number(present[i]) || 0,
    times_absent: Number(absent[i]) || 0,
    entered_by: teacherId
  }));

  if (rows.length) {
    // Note: Postgres upsert only touches columns present in each row object,
    // so principal_remark (set separately by admin) is preserved automatically.
    const { error } = await supabase.from('psychomotor_scores')
      .upsert(rows, { onConflict: 'student_id,session,term' });
    if (error) throw error;
  }

  req.flash('success', 'Psychomotor & attendance scores saved successfully.');
  res.redirect('/formteacher/psychomotor');
}));

module.exports = router;
