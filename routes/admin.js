const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const supabase = require('../db/supabase');
const asyncHandler = require('../utils/asyncHandler');
const { requireLogin, requireRole } = require('../middleware/auth');
const { DEFAULT_GRADING_SCALE, DEFAULT_ASSESSMENT_STRUCTURE, validateAssessmentStructure } = require('../utils/grading');
const {
  mapSchool, mapClass, mapSubject, mapStudent, mapUser,
  mapAssignment, mapFormTeacherAssignment
} = require('../utils/mappers');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Only image files are allowed'));
    cb(null, true);
  }
});

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
  res.render('admin/config', {
    gradingScale: req.session.school.gradingScale || DEFAULT_GRADING_SCALE,
    assessmentStructure: (req.session.school.assessmentStructure && req.session.school.assessmentStructure.length)
      ? req.session.school.assessmentStructure : DEFAULT_ASSESSMENT_STRUCTURE
  });
});

router.post('/config', asyncHandler(async (req, res) => {
  const { schoolName, address, phone, email, session, term, daysOpen } = req.body;
  const { error } = await supabase.from('schools').update({
    name: schoolName, address, phone, email, session, term,
    days_open: Number(daysOpen) || 0
  }).eq('id', req.session.school.id);
  if (error) throw error;
  await refreshSchoolSession(req);
  req.flash('success', 'School configuration updated.');
  res.redirect('/admin/config');
}));

router.post('/config/logo', upload.single('logo'), asyncHandler(async (req, res) => {
  if (!req.file) {
    req.flash('error', 'Please choose an image file to upload.');
    return res.redirect('/admin/config');
  }
  const schoolId = req.session.school.id;
  const ext = (req.file.originalname.split('.').pop() || 'png').toLowerCase();
  const path = `${schoolId}/logo.${ext}`;

  const { error: uploadErr } = await supabase.storage.from('school-logos')
    .upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
  if (uploadErr) throw uploadErr;

  const { data: publicUrlData } = supabase.storage.from('school-logos').getPublicUrl(path);
  // Cache-bust so the browser picks up a re-uploaded logo immediately
  const logoUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;

  const { error: updateErr } = await supabase.from('schools').update({ logo_url: logoUrl }).eq('id', schoolId);
  if (updateErr) throw updateErr;

  await refreshSchoolSession(req);
  req.flash('success', 'School logo updated.');
  res.redirect('/admin/config');
}));

router.post('/config/grading', asyncHandler(async (req, res) => {
  const { grade, min, max, remark } = req.body;
  const grades = [].concat(grade || []);
  const mins = [].concat(min || []);
  const maxs = [].concat(max || []);
  const remarks = [].concat(remark || []);
  const gradingScale = grades.map((g, i) => ({
    grade: g, min: Number(mins[i]), max: Number(maxs[i]), remark: remarks[i]
  })).filter(g => g.grade);
  const { error } = await supabase.from('schools').update({ grading_scale: gradingScale }).eq('id', req.session.school.id);
  if (error) throw error;
  await refreshSchoolSession(req);
  req.flash('success', 'Grading scale updated.');
  res.redirect('/admin/config');
}));

router.post('/config/assessment', asyncHandler(async (req, res) => {
  const { caEnabled, caLabel1, caLabel2, caLabel3, caMax1, caMax2, caMax3, examLabel, examMax } = req.body;
  const enabledSet = new Set([].concat(caEnabled || []).map(String));

  const caLabels = { 1: caLabel1, 2: caLabel2, 3: caLabel3 };
  const caMaxes = { 1: caMax1, 2: caMax2, 3: caMax3 };

  const structure = [];
  let caIndex = 0;
  [1, 2, 3].forEach(n => {
    if (enabledSet.has(String(n))) {
      caIndex++;
      structure.push({
        key: 'ca' + caIndex,
        label: (caLabels[n] && caLabels[n].trim()) || `CA ${caIndex}`,
        type: 'ca',
        max: Number(caMaxes[n]) || 0
      });
    }
  });
  structure.push({
    key: 'exam',
    label: (examLabel && examLabel.trim()) || 'Exam',
    type: 'exam',
    max: Number(examMax) || 0
  });

  const validationError = validateAssessmentStructure(structure);
  if (validationError) {
    req.flash('error', validationError);
    return res.redirect('/admin/config');
  }

  const { error: updateErr } = await supabase.from('schools').update({ assessment_structure: structure }).eq('id', req.session.school.id);
  if (updateErr) throw updateErr;
  await refreshSchoolSession(req);
  req.flash('success', 'Assessment structure updated. Note: this does not retroactively change previously saved scores.');
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
  const {
    name, regNo, classId, gender, dob,
    fatherName, fatherPhone, motherName, motherPhone,
    homeAddress, stateOfOrigin, nationality, religion,
    bloodGroup, genotype, previousSchool
  } = req.body;
  const schoolId = req.session.school.id;
  if (!name || !classId) {
    req.flash('error', 'Student name and class are required.');
    return res.redirect('/admin/students');
  }
  const finalRegNo = (regNo && regNo.trim()) || ('STU' + Math.floor(10000 + Math.random() * 89999));
  const { error } = await supabase.from('students').insert({
    school_id: schoolId, name: name.trim(), reg_no: finalRegNo,
    class_id: classId, gender: gender || '', dob: dob || null,
    father_name: fatherName || '', father_phone: fatherPhone || '',
    mother_name: motherName || '', mother_phone: motherPhone || '',
    home_address: homeAddress || '', state_of_origin: stateOfOrigin || '',
    nationality: nationality || 'Nigerian', religion: religion || '',
    blood_group: bloodGroup || '', genotype: genotype || '',
    previous_school: previousSchool || ''
  });
  if (error) throw error;
  req.flash('success', `Student "${name}" registered with reg. no. ${finalRegNo}.`);
  res.redirect('/admin/students');
}));

router.get('/students/:id/edit', asyncHandler(async (req, res) => {
  const schoolId = req.session.school.id;
  const [{ data: studentRow, error: sErr }, { data: classRows, error: cErr }] = await Promise.all([
    supabase.from('students').select('*').eq('id', req.params.id).eq('school_id', schoolId).single(),
    supabase.from('classes').select('*').eq('school_id', schoolId)
  ]);
  if (sErr) throw sErr;
  if (cErr) throw cErr;
  res.render('admin/student-edit', {
    student: mapStudent(studentRow),
    classes: (classRows || []).map(mapClass)
  });
}));

router.post('/students/:id/edit', asyncHandler(async (req, res) => {
  const {
    name, regNo, classId, gender, dob,
    fatherName, fatherPhone, motherName, motherPhone,
    homeAddress, stateOfOrigin, nationality, religion,
    bloodGroup, genotype, previousSchool
  } = req.body;
  if (!name || !classId) {
    req.flash('error', 'Student name and class are required.');
    return res.redirect(`/admin/students/${req.params.id}/edit`);
  }
  const { error } = await supabase.from('students').update({
    name: name.trim(), reg_no: regNo, class_id: classId,
    gender: gender || '', dob: dob || null,
    father_name: fatherName || '', father_phone: fatherPhone || '',
    mother_name: motherName || '', mother_phone: motherPhone || '',
    home_address: homeAddress || '', state_of_origin: stateOfOrigin || '',
    nationality: nationality || 'Nigerian', religion: religion || '',
    blood_group: bloodGroup || '', genotype: genotype || '',
    previous_school: previousSchool || ''
  }).eq('id', req.params.id).eq('school_id', req.session.school.id);
  if (error) throw error;
  req.flash('success', 'Student record updated.');
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
    { data: assignRows, error: aErr },
    { data: ftaRows, error: ftaErr }
  ] = await Promise.all([
    supabase.from('users').select('*').eq('school_id', schoolId).eq('role', 'teacher').order('name'),
    supabase.from('classes').select('*').eq('school_id', schoolId),
    supabase.from('subjects').select('*').eq('school_id', schoolId),
    supabase.from('teacher_assignments').select('*').eq('school_id', schoolId),
    supabase.from('form_teacher_assignments').select('*').eq('school_id', schoolId)
  ]);
  if (tErr) throw tErr; if (cErr) throw cErr; if (sErr) throw sErr;
  if (aErr) throw aErr; if (ftaErr) throw ftaErr;

  const classes = (classRows || []).map(mapClass);
  const subjects = (subjectRows || []).map(mapSubject);
  const assignments = (assignRows || []).map(mapAssignment);
  const ftAssignments = (ftaRows || []).map(mapFormTeacherAssignment);

  const classMap = {}; classes.forEach(c => classMap[c.id] = c.name);
  const subjectMap = {}; subjects.forEach(s => subjectMap[s.id] = s.name);

  const teacherAssignments = {};
  assignments.forEach(a => {
    if (!teacherAssignments[a.teacherId]) teacherAssignments[a.teacherId] = [];
    teacherAssignments[a.teacherId].push(`${subjectMap[a.subjectId] || '?'} - ${classMap[a.classId] || '?'}`);
  });

  // Map classId -> form teacher name
  const formTeacherMap = {};
  ftAssignments.forEach(fta => {
    const teacher = (teacherRows || []).find(t => t.id === fta.teacherId);
    formTeacherMap[fta.classId] = teacher ? teacher.name : '';
  });

  // Map teacherId -> classId as form teacher
  const teacherFormClass = {};
  ftAssignments.forEach(fta => { teacherFormClass[fta.teacherId] = fta.classId; });

  res.render('admin/teachers', {
    teachers: (teacherRows || []).map(mapUser), classes, subjects,
    teacherAssignments, formTeacherMap, teacherFormClass, classMap
  });
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
  await supabase.from('form_teacher_assignments').delete().eq('teacher_id', teacherId).eq('school_id', schoolId);
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
  const { data: dup } = await supabase.from('teacher_assignments')
    .select('id').eq('teacher_id', teacherId).eq('subject_id', subjectId).eq('class_id', classId).eq('school_id', schoolId).maybeSingle();
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

router.post('/teachers/:id/assign-form', asyncHandler(async (req, res) => {
  const teacherId = req.params.id;
  const { classId } = req.body;
  const schoolId = req.session.school.id;
  if (!classId) {
    req.flash('error', 'Select a class.');
    return res.redirect('/admin/teachers');
  }
  const { error } = await supabase.from('form_teacher_assignments').upsert({
    school_id: schoolId, teacher_id: teacherId, class_id: classId
  }, { onConflict: 'school_id,class_id' });
  if (error) throw error;
  req.flash('success', 'Form teacher assigned.');
  res.redirect('/admin/teachers');
}));

// ---------- Principal's remark on a student's result ----------
router.post('/results/:studentId/remark', asyncHandler(async (req, res) => {
  const schoolId = req.session.school.id;
  const studentId = req.params.studentId;
  const school = req.session.school;
  const { principalRemark, session, term } = req.body;
  const useSession = session || school.session;
  const useTerm = term || school.term;

  const { data: studentRow, error: stErr } = await supabase.from('students')
    .select('class_id').eq('id', studentId).eq('school_id', schoolId).maybeSingle();
  if (stErr) throw stErr;
  if (!studentRow) {
    req.flash('error', 'Student not found.');
    return res.redirect('/admin/results');
  }

  const { data: existing, error: exErr } = await supabase.from('psychomotor_scores')
    .select('id').eq('student_id', studentId).eq('session', useSession).eq('term', useTerm).maybeSingle();
  if (exErr) throw exErr;

  if (existing) {
    const { error } = await supabase.from('psychomotor_scores')
      .update({ principal_remark: principalRemark || '' }).eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('psychomotor_scores').insert({
      school_id: schoolId, student_id: studentId, class_id: studentRow.class_id,
      session: useSession, term: useTerm, principal_remark: principalRemark || ''
    });
    if (error) throw error;
  }

  req.flash('success', "Principal's remark saved.");
  res.redirect(`/results/${studentId}?session=${encodeURIComponent(useSession)}&term=${encodeURIComponent(useTerm)}`);
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
