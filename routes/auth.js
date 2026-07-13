const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const supabase = require('../db/supabase');
const asyncHandler = require('../utils/asyncHandler');
const { mapSchool, mapUser } = require('../utils/mappers');

router.get('/', (req, res) => {
  res.render('index');
});

// ---------- School Registration ----------
router.get('/register-school', (req, res) => {
  res.render('register-school');
});

router.post('/register-school', asyncHandler(async (req, res) => {
  const { schoolName, address, phone, email, session, term, adminName, adminEmail, password, confirmPassword } = req.body;

  if (!schoolName || !adminEmail || !password) {
    req.flash('error', 'Please fill in all required fields.');
    return res.redirect('/register-school');
  }
  if (password !== confirmPassword) {
    req.flash('error', 'Passwords do not match.');
    return res.redirect('/register-school');
  }

  const normalizedEmail = adminEmail.toLowerCase().trim();

  const { data: existing, error: existingErr } = await supabase
    .from('users').select('id').eq('email', normalizedEmail).maybeSingle();
  if (existingErr) throw existingErr;
  if (existing) {
    req.flash('error', 'An account with that email already exists.');
    return res.redirect('/register-school');
  }

  // Generate a short, human-friendly school code; retry on the rare collision.
  let school = null;
  for (let attempt = 0; attempt < 5 && !school; attempt++) {
    const code = (schoolName.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 4) || 'SCH') + Math.floor(1000 + Math.random() * 9000);
    const { data, error } = await supabase.from('schools').insert({
      name: schoolName,
      code,
      address: address || '',
      phone: phone || '',
      email: email || '',
      session: session || '2025/2026',
      term: term || '1st Term'
    }).select().single();

    if (!error) {
      school = data;
    } else if (error.code !== '23505') { // not a unique-violation, so a real error
      throw error;
    }
  }

  if (!school) {
    req.flash('error', 'Could not generate a unique school code, please try again.');
    return res.redirect('/register-school');
  }

  const hash = bcrypt.hashSync(password, 10);
  const { error: userErr } = await supabase.from('users').insert({
    school_id: school.id,
    name: adminName || 'Administrator',
    email: normalizedEmail,
    password: hash,
    role: 'admin'
  });
  if (userErr) throw userErr;

  req.flash('success', `School registered successfully! Your school code is ${school.code}. Please keep it safe - you and your teachers will need it to log in.`);
  res.redirect('/login');
}));

// ---------- Login / Logout ----------
router.get('/login', (req, res) => {
  res.render('login');
});

router.post('/login', asyncHandler(async (req, res) => {
  const { schoolCode, email, password } = req.body;

  const { data: schoolRow, error: schoolErr } = await supabase
    .from('schools').select('*').eq('code', (schoolCode || '').toUpperCase().trim()).maybeSingle();
  if (schoolErr) throw schoolErr;
  if (!schoolRow) {
    req.flash('error', 'Invalid school code.');
    return res.redirect('/login');
  }

  const { data: userRow, error: userErr } = await supabase
    .from('users').select('*')
    .eq('school_id', schoolRow.id)
    .eq('email', (email || '').toLowerCase().trim())
    .maybeSingle();
  if (userErr) throw userErr;

  if (!userRow || !bcrypt.compareSync(password || '', userRow.password)) {
    req.flash('error', 'Invalid email or password.');
    return res.redirect('/login');
  }

  const user = mapUser(userRow);
  const school = mapSchool(schoolRow);

  req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role, schoolId: school.id };
  req.session.school = school;

  if (user.role === 'admin') return res.redirect('/admin');
  return res.redirect('/teacher');
}));

router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;
