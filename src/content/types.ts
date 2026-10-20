// 세 컨셉이 공유하는 콘텐츠 스키마. ko.ts / en.ts가 같은 모양을 지킨다.
// 숫자·연도·URL은 두 언어에서 바이트 단위로 같아야 한다.

export type Lang = 'ko' | 'en'

export interface Link {
  label: string
  url: string
}

export interface CareerEntry {
  id: string
  company: string
  role: string
  /** 시작 연도 (정렬 키). Deep Dive는 내림차순, Museum은 오름차순으로 쓴다. */
  from: number
  /** 종료 연도. 현재 진행 중이면 null. */
  to: number | null
  period: string
  summary: string
  highlights: string[]
  /** 대표 수상·외부 인정 (없으면 빈 배열) */
  honors: string[]
}

export interface Project {
  id: string
  name: string
  year: number
  tagline: string
  description: string
  stack: string[]
  links: Link[]
  /** 한 줄 ASCII 물고기 — Terminal·Deep Dive에서 어종 표식으로 쓴다 */
  glyph: string
}

export interface Stat {
  value: string
  label: string
}

export interface Content {
  lang: Lang
  meta: { title: string; description: string }
  ui: {
    langToggle: string
    nav: { about: string; career: string; projects: string; contact: string }
    scrollHint: string
    present: string
    viewProject: string
    backToConcepts: string
    reducedMotionNote: string
  }
  profile: {
    name: string
    role: string
    intro: string
    bio: string[]
    location: string
    email: string
    links: Link[]
  }
  stats: Stat[]
  career: CareerEntry[]
  projects: Project[]
  skills: { group: string; items: string[] }[]
  /** 원티드 iOS 저장소 본인 커밋 수 (연도별 집계, 2026-10-19 기준) */
  commits: { asOf: string; total: number; byYear: { year: number; count: number }[] }
  contact: { heading: string; body: string }
}
