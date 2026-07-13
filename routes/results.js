const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');
const asyncHandler = require('../utils/asyncHandler');
const { requireLogin } = require('../middleware/auth');
const { mapStudent, mapClass, mapSubject, mapScore } = require('../utils/mappers');

router.use(requireLogin);

router.get('/:studentId', asyncHandler(async (req, res) => {
  const schoolId = req.session.school.id;
  const school = req.session.school;
  const studentId = req.params.studentId;

  const { data: studentRow, error: studentErr } = await supabase.from('students')
    .select('*').eq('id', studentId).eq('school_id', schoolId).maybeSingle();
  if (studentErr) throw studentErr;
  if (!studentRow) {
    req.flash('error', 'Student not found.');
    return res.redirect(req.get('Referer') || (req.session.user.role === 'admin' ? '/admin' : '/teacher'));
  }
  const student = mapStudent(studentRow);

  // Teachers may only view results for students they teach; admins can view any.
  if (req.session.user.role === 'teacher') {
    const { data: teachesRow, error: teachesErr } = await supabase.from('teacher_assignments')
      .select('id').eq('school_id', schoolId).eq('teacher_id', req.session.user.id).eq('class_id', student.classId).maybeSingle();
    if (teachesErr) throw teachesErr;
    if (!teachesRow) {
      req.flash('error', 'You do not teach this class.');
      return res.redirect('/teacher');
    }
  }

  const session = req.query.session || school.session;
  const term = req.query.term || school.term;

  const [{ data: scoreRows, error: scErr }, { data: subjectRows, error: subjErr }, { data: clsRow, error: clsErr }] = await Promise.all([
    supabase.from('scores').select('*').eq('school_id', schoolId).eq('student_id', studentId).eq('session', session).eq('term', term),
    supabase.from('subjects').select('*').eq('school_id', schoolId),
    supabase.from('classes').select('*').eq('id', student.classId).maybeSingle()
  ]);
  if (scErr) throw scErr;
  if (subjErr) throw subjErr;
  if (clsErr) throw clsErr;

  const subjectMap = {}; (subjectRows || []).map(mapSubject).forEach(s => subjectMap[s.id] = s.name);
  const scores = (scoreRows || []).map(mapScore);

  const rows = scores.map(sc => ({
    subject: subjectMap[sc.subjectId] || 'Unknown',
    ca1: sc.ca1, ca2: sc.ca2, exam: sc.exam, total: sc.total, grade: sc.grade, remark: sc.remark
  })).sort((a, b) => a.subject.localeCompare(b.subject));

  const totalScore = rows.reduce((sum, r) => sum + r.total, 0);
  const average = rows.length ? (totalScore / rows.length).toFixed(2) : '0.00';

  // Class position based on average score across the same session/term
  const classId = student.classId;
  const { data: classmateRows, error: cmErr } = await supabase.from('students').select('id').eq('school_id', schoolId).eq('class_id', classId);
  if (cmErr) throw cmErr;
  const classmates = classmateRows || [];

  const { data: allScoresRows, error: allScErr } = await supabase.from('scores')
    .select('student_id, total').eq('school_id', schoolId).eq('class_id', classId).eq('session', session).eq('term', term);
  if (allScErr) throw allScErr;

  const totalsByStudent = {};
  (allScoresRows || []).forEach(r => {
    if (!totalsByStudent[r.student_id]) totalsByStudent[r.student_id] = { sum: 0, count: 0 };
    totalsByStudent[r.student_id].sum += Number(r.total);
    totalsByStudent[r.student_id].count += 1;
  });

  const rankings = classmates.map(cm => {
    const t = totalsByStudent[cm.id];
    const avg = t && t.count ? t.sum / t.count : 0;
    return { studentId: cm.id, avg };
  }).sort((a, b) => b.avg - a.avg);
  const position = rankings.findIndex(r => r.studentId === studentId) + 1;

  res.render('results/sheet', {
    student, cls: mapClass(clsRow), school, session, term, rows, totalScore, average,
    position, classSize: classmates.length
  });
}));

module.exports = router;
