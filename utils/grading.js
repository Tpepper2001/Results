// Default grading scale used for newly registered schools.
// Schools can edit this from School Configuration.
const DEFAULT_GRADING_SCALE = [
  { grade: 'A', min: 70, max: 100, remark: 'Excellent' },
  { grade: 'B', min: 60, max: 69, remark: 'Very Good' },
  { grade: 'C', min: 50, max: 59, remark: 'Good' },
  { grade: 'D', min: 45, max: 49, remark: 'Fair' },
  { grade: 'E', min: 40, max: 44, remark: 'Pass' },
  { grade: 'F', min: 0, max: 39, remark: 'Fail' }
];

function getGrade(total, gradingScale) {
  const scale = (gradingScale && gradingScale.length) ? gradingScale : DEFAULT_GRADING_SCALE;
  const found = scale.find(g => total >= g.min && total <= g.max);
  return found || { grade: '-', remark: '-' };
}

// CA1 max 20, CA2 max 20, Exam max 60 => total max 100 (fixed weighting as requested)
const SCORE_MAX = { ca1: 20, ca2: 20, exam: 60, total: 100 };

module.exports = { DEFAULT_GRADING_SCALE, getGrade, SCORE_MAX };
