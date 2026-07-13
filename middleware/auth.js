function requireLogin(req, res, next) {
  if (!req.session.user) {
    req.flash('error', 'Please log in to continue.');
    return res.redirect('/login');
  }
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.session.user || req.session.user.role !== role) {
      req.flash('error', 'You do not have permission to view that page.');
      return res.redirect('/login');
    }
    next();
  };
}

module.exports = { requireLogin, requireRole };
