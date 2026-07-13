const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');
const asyncHandler = require('../utils/asyncHandler');
const { requireLogin, requireRole } = require('../middleware/auth');
const { getGrade, SCORE_MAX } = require('../utils/grading');
const { mapClass, mapSubject, mapAssignment, mapStudent, mapScore } = require('../utils/mappers');

router.use(requireLogin, requireRole('teacher'));

router.get('/', asyncHandler(async (req, res) => {
  const schoolId = req.session.school.id;
  const teacherId = req.session.user.id;

  const [
    { data: assignRows, error: aErr },
    { data: classRows, error: cErr },
    { data: subjectRows, error: sErr },
    { data: ftaRow, error: ftaErr }
  ] = await Promise.all([
    supabase.from('teacher_assignments').select('*').eq('school_id', schoolId).eq('teacher_id', teacherId),
    supabase.from('classes').select('*').eq('school_id', schoolId),
    supabase.from('subjects').select('*').eq('school_id', schoolId),
    supabase.from('form_teacher_assignments').select('*').eq('school_id', schoolId).eq('teacher_id', teacherId).maybeSingle()
  ]);
  if (aErr) throw aErr; if (cErr) throw cErr; if (sErr) throw sErr; if (ftaErr) throw ftaErr;

  const classMap = {}; (classRows || []).map(mapClass).forEach(c => classMap[c.id] = c.name);
  const subjectMap = {}; (subjectRows || []).map(mapSubject).forEach(s => subjectMap[s.id] = s.name);

  const list = (assignRows || []).map(mapAssignment).map(a => ({
    id: a.id, classId: a.classId, subjectId: a.subjectId,
    className: classMap[a.classId] || 'Unknown class',
    subjectName: subjectMap[a.subjectId] || 'Unknown subject'
  }));

  const isFormTeacher = !!ftaRow;
  const formClass = ftaRow ? classMap[ftaRow.class_id] : null;

  res.render('teacher/dashboard', { list, isFormTeacher, formClass });
}));

router.get('/scores', asyncHandler(async (req, res) => {
  const schoolId = req.session.school.id;
  const teacherId = req.session.user.id;
  const { classId, subjectId } = req.query;

  const { data: ownsRow, error: ownsErr } = await supabase.from('teacher_assignments')
    .select('id').eq('school_id', schoolId).eq('teacher_id', teacherId).eq('class_id', classId).eq('subject_id', subjectId).maybeSingle();
  if (ownsErr) throw ownsErr;
  if (!ownsRow) {
    req.flash('error', 'You are not assigned to that subject/class.');
    return res.redirect('/teacher');
  }

  const school = req.session.school;
  const [
    { data: studentRows, error: stErr },
    { data: clsRow, error: clsErr },
    { data: subjRow, error: subjErr },
    { data: scoreRows, error: scErr }
  ] = await Promise.all([
    supabase.from('students').select('*').eq('school_id', schoolId).eq('class_id', classId).order('name'),
    supabase.from('classes').select('*').eq('id', classId).single(),
    supabase.from('subjects').select('*').eq('id', subjectId).single(),
    supabase.from('scores').select('*').eq('school_id', schoolId).eq('subject_id', subjectId).eq('class_id', classId).eq('session', school.session).eq('term', school.term)
  ]);
  if (stErr) throw stErr; if (clsErr) throw clsErr; if (subjErr) throw subjErr; if (scErr) throw scErr;

  const students = (studentRows || []).map(mapStudent);
  const scores = (scoreRows || []).map(mapScore);
  const existingScores = {};
  students.forEach(st => {
    const sc = scores.find(s => s.studentId === st.id);
    existingScores[st.id] = sc || { ca1: '', ca2: '', exam: '', total: 0 };
  });

  res.render('teacher/scores', {
    students, cls: mapClass(clsRow), subject: mapSubject(subjRow),
    classId, subjectId, existingScores, SCORE_MAX
  });
}));

router.post('/scores', asyncHandler(async (req, res) => {
  const schoolId = req.session.school.id;
  const teacherId = req.session.user.id;
  const school = req.session.school;
  const { classId, subjectId, studentIds, ca1, ca2, exam } = req.body;

  const { data: ownsRow, error: ownsErr } = await supabase.from('teacher_assignments')
    .select('id').eq('school_id', schoolId).eq('teacher_id', teacherId).eq('class_id', classId).eq('subject_id', subjectId).maybeSingle();
  if (ownsErr) throw ownsErr;
  if (!ownsRow) {
    req.flash('error', 'You are not assigned to that subject/class.');
    return res.redirect('/teacher');
  }

  const ids = [].concat(studentIds || []);
  const ca1s = [].concat(ca1 || []);
  const ca2s = [].concat(ca2 || []);
  const exams = [].concat(exam || []);

  const rows = ids.map((studentId, i) => {
    const c1 = Math.min(SCORE_MAX.ca1, Math.max(0, Number(ca1s[i]) || 0));
    const c2 = Math.min(SCORE_MAX.ca2, Math.max(0, Number(ca2s[i]) || 0));
    const ex = Math.min(SCORE_MAX.exam, Math.max(0, Number(exams[i]) || 0));
    const total = c1 + c2 + ex;
    const gradeInfo = getGrade(total, school.gradingScale);
    return {
      school_id: schoolId, student_id: studentId, subject_id: subjectId, class_id: classId,
      session: school.session, term: school.term,
      ca1: c1, ca2: c2, exam: ex, total, grade: gradeInfo.grade, remark: gradeInfo.remark, teacher_id: teacherId
    };
  });

  if (rows.length) {
    const { error } = await supabase.from('scores').upsert(rows, { onConflict: 'student_id,subject_id,session,term' });
    if (error) throw error;
  }

  req.flash('success', 'Scores saved successfully.');
  res.redirect(`/teacher/scores?classId=${classId}&subjectId=${subjectId}`);
}));

module.exports = router;
