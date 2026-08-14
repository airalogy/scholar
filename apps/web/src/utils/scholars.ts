export type ScholarCollege = string[] | null | undefined

export const getScholarCollegeNames = (college: ScholarCollege): string[] => {
  return (college ?? [])
    .map((item) => item.trim())
    .filter(Boolean)
}

export const formatScholarCollege = (
  college: ScholarCollege,
  fallback = ''
): string => {
  const colleges = getScholarCollegeNames(college)
  return colleges.length ? colleges.join('、') : fallback
}
