// 언어와 무관한 값. ko/en 양쪽이 여기서 가져다 써서 숫자가 어긋나지 않게 한다.

export const commitsByYear = [
  { year: 2015, count: 121 },
  { year: 2016, count: 444 },
  { year: 2017, count: 326 },
  { year: 2018, count: 625 },
  { year: 2019, count: 577 },
  { year: 2020, count: 875 },
  { year: 2021, count: 884 },
  { year: 2022, count: 294 },
  { year: 2023, count: 725 },
  { year: 2024, count: 1267 },
  { year: 2025, count: 1438 },
  { year: 2026, count: 1145 },
]

export const commits = {
  asOf: '2026-10-19',
  total: commitsByYear.reduce((sum, y) => sum + y.count, 0),
  byYear: commitsByYear,
}

export const email = 'agiletalk@me.com'

export const links = {
  github: 'https://github.com/agiletalk',
  blog: 'https://agiletalk.github.io',
  resume: 'https://github.com/agiletalk/resume/releases/latest',
}

export const glyphs = {
  vivarium: '><(((º>',
  aquarium: '><>',
  museum: '<°)))><',
  relnote: '>=>',
  themes: '>°))<',
  swiftuinote: '<><',
}
