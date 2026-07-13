const { getGrade } = require('./grading');

function parseComponentArrays(structure, body) {
  const arrays = {};
  structure.forEach(comp => { arrays[comp.key] = [].concat(body['comp_' + comp.key] || []); });
  return arrays;
}

// Builds an array of score row objects (snake_case, ready for Supabase upsert)
// from submitted form data, honoring the school's custom assessment structure
// and any students marked "Not Offering" this subject.
function buildScoreRows({ structure, ids, body, notOfferingIds, schoolId, subjectId, classId, session, term, teacherId, gradingScale }) {
  const componentArrays = parseComponentArrays(structure, body);

  return ids.map((studentId, i) => {
    if (notOfferingIds.has(studentId)) {
      return {
        school_id: schoolId, student_id: studentId, subject_id: subjectId, class_id: classId,
        session, term, components: {}, total: 0, grade: '-', remark: 'Not Offering',
        teacher_id: teacherId, not_offering: true
      };
    }

    const components = {};
    let total = 0;
    structure.forEach(comp => {
      const raw = Number(componentArrays[comp.key][i]) || 0;
      const clamped = Math.min(comp.max, Math.max(0, raw));
      components[comp.key] = clamped;
      total += clamped;
    });
    const gradeInfo = getGrade(total, gradingScale);

    return {
      school_id: schoolId, student_id: studentId, subject_id: subjectId, class_id: classId,
      session, term, components, total, grade: gradeInfo.grade, remark: gradeInfo.remark,
      teacher_id: teacherId, not_offering: false
    };
  });
}

module.exports = { buildScoreRows };
