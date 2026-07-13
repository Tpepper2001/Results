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

// Default assessment structure: 1st CA (20) + 2nd CA (20) + Exam (60) = 100.
// Schools can customize this to 1-3 CA components + exactly 1 Exam component,
// as long as all max scores sum to 100.
const DEFAULT_ASSESSMENT_STRUCTURE = [
  { key: 'ca1', label: '1st CA', type: 'ca', max: 20 },
  { key: 'ca2', label: '2nd CA', type: 'ca', max: 20 },
  { key: 'exam', label: 'Exam', type: 'exam', max: 60 }
];

// Validates a proposed assessment structure. Returns an error message string
// if invalid, or null if valid.
function validateAssessmentStructure(structure) {
  if (!Array.isArray(structure) || !structure.length) {
    return 'Assessment structure cannot be empty.';
  }
  const caCount = structure.filter(c => c.type === 'ca').length;
  const examCount = structure.filter(c => c.type === 'exam').length;
  if (caCount < 1 || caCount > 3) {
    return 'You must have between 1 and 3 CA components.';
  }
  if (examCount !== 1) {
    return 'You must have exactly 1 Exam component.';
  }
  const sum = structure.reduce((s, c) => s + (Number(c.max) || 0), 0);
  if (sum !== 100) {
    return `Component max scores must add up to exactly 100 (currently ${sum}).`;
  }
  if (structure.some(c => !c.key || !c.label || Number(c.max) <= 0)) {
    return 'Every component needs a label and a max score greater than 0.';
  }
  return null;
}

module.exports = { DEFAULT_GRADING_SCALE, DEFAULT_ASSESSMENT_STRUCTURE, getGrade, validateAssessmentStructure };
