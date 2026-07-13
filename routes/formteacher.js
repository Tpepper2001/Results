const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');
const asyncHandler = require('../utils/asyncHandler');
const { requireLogin } = require('../middleware/auth');
const { mapClass, mapStudent, mapPsychomotor, PSYCHOMOTOR_SKILLS, PSYCHOMOTOR_RATING } = require('../utils/mappers');

router.use(requireLogin);

// Only teachers who are form teachers for a class can access these routes
async function getFormTeacherClass(schoolId, teacherId) {
  const { data, error } = await supabase.from('form_teacher_assignments')
    .select('*').eq('school_id', schoolId).eq('teacher_id', teacherId).maybeSingle();
  if (error) throw error;
  return data || null;
}

// ---------- Psychomotor entry form ----------
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
    practical_skills, verbal_fluency, creativity, form_teacher_comment } = req.body;

  const ids = [].concat(studentIds || []);
  const hw = [].concat(handwriting || []);
  const dr = [].concat(drawing || []);
  const sp = [].concat(sports || []);
  const ma = [].concat(musical_ability || []);
  const ps = [].concat(practical_skills || []);
  const vf = [].concat(verbal_fluency || []);
  const cr = [].concat(creativity || []);
  const comments = [].concat(form_teacher_comment || []);

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
    entered_by: teacherId
  }));

  if (rows.length) {
    const { error } = await supabase.from('psychomotor_scores')
      .upsert(rows, { onConflict: 'student_id,session,term' });
    if (error) throw error;
  }

  req.flash('success', 'Psychomotor scores saved successfully.');
  res.redirect('/formteacher/psychomotor');
}));

module.exports = router;
