const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');
const asyncHandler = require('../utils/asyncHandler');
const { requireLogin, requireRole } = require('../middleware/auth');
const { DEFAULT_ASSESSMENT_STRUCTURE } = require('../utils/grading');
const { buildScoreRows } = require('../utils/scoreHelpers');
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
  const formClassId = ftaRow ? ftaRow.class_id : null;

  // If this teacher is also a form teacher, find subjects in their form class
  // that have NO subject teacher assigned (so they can grade the gap).
  let unassignedSubjects = [];
  if (formClassId) {
    const { data: allAssignRows } = await supabase.from('teacher_assignments').select('subject_id').eq('school_id', schoolId).eq('class_id', formClassId);
    const assignedSubjectIds = new Set((allAssignRows || []).map(a => a.subject_id));
    unassignedSubjects = (subjectRows || []).map(mapSubject).filter(s => !assignedSubjectIds.has(s.id));
  }

  res.render('teacher/dashboard', { list, isFormTeacher, formClass, formClassId, unassignedSubjects });
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
    classId, subjectId, existingScores, structure,
    postAction: '/teacher/scores'
  });
}));

router.post('/scores', asyncHandler(async (req, res) => {
  const schoolId = req.session.school.id;
  const teacherId = req.session.user.id;
  const school = req.session.school;
  const { classId, subjectId, studentIds } = req.body;

  const { data: ownsRow, error: ownsErr } = await supabase.from('teacher_assignments')
    .select('id').eq('school_id', schoolId).eq('teacher_id', teacherId).eq('class_id', classId).eq('subject_id', subjectId).maybeSingle();
  if (ownsErr) throw ownsErr;
  if (!ownsRow) {
    req.flash('error', 'You are not assigned to that subject/class.');
    return res.redirect('/teacher');
  }

  const { data: clsRow, error: clsErr } = await supabase.from('classes').select('*').eq('id', classId).single();
  if (clsErr) throw clsErr;
  const structure = mapClass(clsRow).assessmentStructure || DEFAULT_ASSESSMENT_STRUCTURE;
  const ids = [].concat(studentIds || []);
  const notOfferingIds = new Set([].concat(req.body.notOfferingIds || []));

  const rows = buildScoreRows({
    structure, ids, body: req.body, notOfferingIds,
    schoolId, subjectId, classId, session: school.session, term: school.term,
    teacherId, gradingScale: school.gradingScale
  });

  if (rows.length) {
    const { error } = await supabase.from('scores').upsert(rows, { onConflict: 'student_id,subject_id,session,term' });
    if (error) throw error;
  }

  req.flash('success', 'Scores saved successfully.');
  res.redirect(`/teacher/scores?classId=${classId}&subjectId=${subjectId}`);
}));

module.exports = router;
