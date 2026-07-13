const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const supabase = require('../db/supabase');
const asyncHandler = require('../utils/asyncHandler');
const { requireLogin, requireRole } = require('../middleware/auth');
const { DEFAULT_GRADING_SCALE } = require('../utils/grading');
const { mapSchool, mapClass, mapSubject, mapStudent, mapUser, mapAssignment } = require('../utils/mappers');

router.use(requireLogin, requireRole('admin'));

async function refreshSchoolSession(req) {
  const { data, error } = await supabase.from('schools').select('*').eq('id', req.session.school.id).single();
  if (error) throw error;
  req.session.school = mapSchool(data);
  return req.session.school;
}

// ---------- Dashboard ----------
router.get('/', asyncHandler(async (req, res) => {
  const schoolId = req.session.school.id;
  const [{ count: students }, { count: classes }, { count: subjects }, { count: teachers }] = await Promise.all([
    supabase.from('students').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
    supabase.from('classes').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
    supabase.from('subjects').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
    supabase.from('users').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('role', 'teacher')
  ]);
  res.render('admin/dashboard', { stats: { students, classes, subjects, teachers } });
}));

// ---------- School Configuration ----------
router.get('/config', (req, res) => {
  res.render('admin/config', { gradingScale: req.session.school.gradingScale || DEFAULT_GRADING_SCALE });
});

router.post('/config', asyncHandler(async (req, res) => {
  const { schoolName, address, phone, email, session, term } = req.body;
  const { error } = await supabase.from('schools').update({
    name: schoolName, address, phone, email, session, term
  }).eq('id', req.session.school.id);
  if (error) throw error;
  await refreshSchoolSession(req);
  req.flash('success', 'School configuration updated.');
  res.redirect('/admin/config');
}));

router.post('/config/grading', asyncHandler(async (req, res) => {
  const { grade, min, max, remark } = req.body;
  const grades = [].concat(grade || []);
  const mins = [].concat(min || []);
  const maxs = [].concat(max || []);
  const remarks = [].concat(remark || []);

  const gradingScale = grades.map((g, i) => ({
    grade: g,
    min: Number(mins[i]),
    max: Number(maxs[i]),
    remark: remarks[i]
  })).filter(g => g.grade);

  const { error } = await supabase.from('schools').update({ grading_scale: gradingScale }).eq('id', req.session.school.id);
  if (error) throw error;
  await refreshSchoolSession(req);
  req.flash('success', 'Grading scale updated.');
  res.redirect('/admin/config');
}));

// ---------- Classes ----------
router.get('/classes', asyncHandler(async (req, res) => {
  const { data, error } = await supabase.from('classes').select('*').eq('school_id', req.session.school.id).order('name');
  if (error) throw error;
  res.render('admin/classes', { classes: (data || []).map(mapClass) });
}));

router.post('/classes', asyncHandler(async (req, res) => {
  const { name } = req.body;
  if (name && name.trim()) {
    const { error } = await supabase.from('classes').insert({ school_id: req.session.school.id, name: name.trim() });
    if (error) throw error;
    req.flash('success', 'Class added.');
  }
  res.redirect('/admin/classes');
}));

router.post('/classes/:id/delete', asyncHandler(async (req, res) => {
  const { error } = await supabase.from('classes').delete().eq('id', req.params.id).eq('school_id', req.session.school.id);
  if (error) throw error;
  req.flash('success', 'Class removed.');
  res.redirect('/admin/classes');
}));

// ---------- Subjects ----------
router.get('/subjects', asyncHandler(async (req, res) => {
  const { data, error } = await supabase.from('subjects').select('*').eq('school_id', req.session.school.id).order('name');
  if (error) throw error;
  res.render('admin/subjects', { subjects: (data || []).map(mapSubject) });
}));

router.post('/subjects', asyncHandler(async (req, res) => {
  const { name, code } = req.body;
  if (name && name.trim()) {
    const { error } = await supabase.from('subjects').insert({
      school_id: req.session.school.id, name: name.trim(), code: (code || '').trim()
    });
    if (error) throw error;
    req.flash('success', 'Subject added.');
  }
  res.redirect('/admin/subjects');
}));

router.post('/subjects/:id/delete', asyncHandler(async (req, res) => {
  const { error } = await supabase.from('subjects').delete().eq('id', req.params.id).eq('school_id', req.session.school.id);
  if (error) throw error;
  req.flash('success', 'Subject removed.');
  res.redirect('/admin/subjects');
}));

// ---------- Students ----------
router.get('/students', asyncHandler(async (req, res) => {
  const schoolId = req.session.school.id;
  const [{ data: studentRows, error: sErr }, { data: classRows, error: cErr }] = await Promise.all([
    supabase.from('students').select('*').eq('school_id', schoolId).order('name'),
    supabase.from('classes').select('*').eq('school_id', schoolId)
  ]);
  if (sErr) throw sErr;
  if (cErr) throw cErr;

  const classes = (classRows || []).map(mapClass);
  const classMap = {};
  classes.forEach(c => classMap[c.id] = c.name);

  res.render('admin/students', { students: (studentRows || []).map(mapStudent), classes, classMap });
}));

router.post('/students', asyncHandler(async (req, res) => {
  const { name, regNo, classId, gender, dob } = req.body;
  const schoolId = req.session.school.id;
  if (!name || !classId) {
    req.flash('error', 'Student name and class are required.');
    return res.redirect('/admin/students');
  }
  const finalRegNo = (regNo && regNo.trim()) || ('STU' + Math.floor(10000 + Math.random() * 89999));
  const { error } = await supabase.from('students').insert({
    school_id: schoolId, name: name.trim(), reg_no: finalRegNo, class_id: classId,
    gender: gender || '', dob: dob || null
  });
  if (error) throw error;
  req.flash('success', `Student "${name}" registered with reg. no. ${finalRegNo}.`);
  res.redirect('/admin/students');
}));

router.post('/students/:id/delete', asyncHandler(async (req, res) => {
  const { error } = await supabase.from('students').delete().eq('id', req.params.id).eq('school_id', req.session.school.id);
  if (error) throw error;
  req.flash('success', 'Student removed.');
  res.redirect('/admin/students');
}));

// ---------- Teachers ----------
router.get('/teachers', asyncHandler(async (req, res) => {
  const schoolId = req.session.school.id;
  const [
    { data: teacherRows, error: tErr },
    { data: classRows, error: cErr },
    { data: subjectRows, error: sErr },
    { data: assignRows, error: aErr }
  ] = await Promise.all([
    supabase.from('users').select('*').eq('school_id', schoolId).eq('role', 'teacher').order('name'),
    supabase.from('classes').select('*').eq('school_id', schoolId),
    supabase.from('subjects').select('*').eq('school_id', schoolId),
    supabase.from('teacher_assignments').select('*').eq('school_id', schoolId)
  ]);
  if (tErr) throw tErr;
  if (cErr) throw cErr;
  if (sErr) throw sErr;
  if (aErr) throw aErr;

  const classes = (classRows || []).map(mapClass);
  const subjects = (subjectRows || []).map(mapSubject);
  const assignments = (assignRows || []).map(mapAssignment);

  const classMap = {}; classes.forEach(c => classMap[c.id] = c.name);
  const subjectMap = {}; subjects.forEach(s => subjectMap[s.id] = s.name);

  const teacherAssignments = {};
  assignments.forEach(a => {
    if (!teacherAssignments[a.teacherId]) teacherAssignments[a.teacherId] = [];
    teacherAssignments[a.teacherId].push(`${subjectMap[a.subjectId] || '?'} - ${classMap[a.classId] || '?'}`);
  });

  res.render('admin/teachers', { teachers: (teacherRows || []).map(mapUser), classes, subjects, teacherAssignments });
}));

router.post('/teachers', asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  const schoolId = req.session.school.id;

  if (!name || !email || !password) {
    req.flash('error', 'Please fill in all fields.');
    return res.redirect('/admin/teachers');
  }
  const normalizedEmail = email.toLowerCase().trim();
  const { data: existing, error: existErr } = await supabase.from('users').select('id').eq('email', normalizedEmail).maybeSingle();
  if (existErr) throw existErr;
  if (existing) {
    req.flash('error', 'A user with that email already exists.');
    return res.redirect('/admin/teachers');
  }
  const hash = bcrypt.hashSync(password, 10);
  const { error } = await supabase.from('users').insert({
    school_id: schoolId, name: name.trim(), email: normalizedEmail, password: hash, role: 'teacher'
  });
  if (error) throw error;
  req.flash('success', `Teacher "${name}" registered.`);
  res.redirect('/admin/teachers');
}));

router.post('/teachers/:id/delete', asyncHandler(async (req, res) => {
  const teacherId = req.params.id;
  const schoolId = req.session.school.id;
  await supabase.from('teacher_assignments').delete().eq('teacher_id', teacherId).eq('school_id', schoolId);
  const { error } = await supabase.from('users').delete().eq('id', teacherId).eq('school_id', schoolId);
  if (error) throw error;
  req.flash('success', 'Teacher removed.');
  res.redirect('/admin/teachers');
}));

router.post('/teachers/:id/assign', asyncHandler(async (req, res) => {
  const teacherId = req.params.id;
  const { subjectId, classId } = req.body;
  const schoolId = req.session.school.id;
  if (!subjectId || !classId) {
    req.flash('error', 'Select both a subject and a class.');
    return res.redirect('/admin/teachers');
  }
  const { data: dup, error: dupErr } = await supabase.from('teacher_assignments')
    .select('id').eq('teacher_id', teacherId).eq('subject_id', subjectId).eq('class_id', classId).eq('school_id', schoolId).maybeSingle();
  if (dupErr) throw dupErr;

  if (!dup) {
    const { error } = await supabase.from('teacher_assignments').insert({
      school_id: schoolId, teacher_id: teacherId, subject_id: subjectId, class_id: classId
    });
    if (error) throw error;
    req.flash('success', 'Assignment added.');
  } else {
    req.flash('error', 'That assignment already exists.');
  }
  res.redirect('/admin/teachers');
}));

// ---------- Results overview ----------
router.get('/results', asyncHandler(async (req, res) => {
  const schoolId = req.session.school.id;
  const { data: classRows, error: cErr } = await supabase.from('classes').select('*').eq('school_id', schoolId).order('name');
  if (cErr) throw cErr;
  const classes = (classRows || []).map(mapClass);

  const selectedClassId = req.query.classId || (classes[0] && classes[0].id);
  let students = [];
  if (selectedClassId) {
    const { data: studentRows, error: sErr } = await supabase.from('students').select('*')
      .eq('school_id', schoolId).eq('class_id', selectedClassId).order('name');
    if (sErr) throw sErr;
    students = (studentRows || []).map(mapStudent);
  }
  res.render('admin/results', { classes, students, selectedClassId });
}));

module.exports = router;
