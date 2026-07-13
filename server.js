require('dotenv').config({ quiet: true });
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const path = require('path');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'results-system-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 } // 8 hours
}));
app.use(flash());

// Make user, flash messages and helpers available in all views
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.school = req.session.school || null;
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  next();
});

app.use('/', require('./routes/auth'));
app.use('/admin', require('./routes/admin'));
app.use('/teacher', require('./routes/teacher'));
app.use('/formteacher', require('./routes/formteacher'));
app.use('/results', require('./routes/results'));

app.use((req, res) => {
  res.status(404).render('404');
});

// Centralized error handler — catches errors from asyncHandler-wrapped
// routes (e.g. Supabase/network failures) instead of crashing the process.
app.use((err, req, res, next) => {
  console.error(err);
  req.flash('error', 'Something went wrong. Please try again.');
  const fallback = req.session && req.session.user
    ? (req.session.user.role === 'admin' ? '/admin' : '/teacher')
    : '/login';
  res.redirect(req.get('Referer') || fallback);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Results Management System running on http://localhost:${PORT}`);
});
