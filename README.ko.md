# portfolio

[English](README.md) | **한국어**

15년째 iOS 앱을 만들고, 지금은 AI 에이전트로 개발 방식을 다시 설계하는 전찬주의 포트폴리오입니다.

**→ https://agiletalk.github.io/portfolio/**

살아 있는 터미널 컨셉이에요. `$ whoami` 아래에서 ASCII 어항이 헤엄치고, 커서 주변으로 물결이 일고, 클릭하면 먹이가 떨어져 물고기가 몰려옵니다. 섹션은 CLI 출력(`cat about.md`, `git log --career --graph`, `ls -l projects/`)처럼 나타나고, 스크롤하면 뒤섞인 글자가 제자리를 찾아갑니다. 한국어·영어를 그 자리에서 바꿀 수 있어요.

## 실행

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # → dist/
```

## 구조

| 경로 | 내용 |
|------|------|
| `index.html`, `terminal/` | 사이트 본체 (Living Terminal) |
| `src/content/` | 모든 문구와 숫자 — `ko.ts`/`en.ts`가 같은 스키마, 숫자는 `shared.ts` 한 곳 |
| `src/i18n.ts` | 언어 전환 (페이지 간 유지) |
| `src/lib/motion.ts` | 공통 모션 안전장치: 모션 줄이기, 화면 밖·탭 숨김 시 정지, 기기 등급 |
| `concepts/` | 초기 시안 두 개(Deep Dive, Commit Museum) — 참고용, 개발 서버에서만 보고 배포하지 않음. `npm run concepts` |
| `scripts/check.mjs` | 1440·390px × 모션 켬/끔 스크린샷과 콘솔 에러·가로 스크롤·언어 전환 검사 |

`prefers-reduced-motion`을 존중합니다. 어항은 정지 화면 한 장으로, 텍스트는 바로 표시됩니다.

## 크레딧

- [Pretendard](https://github.com/orioncactus/pretendard)는 SIL Open Font License로 함께 배포합니다 — `src/fonts/OFL.txt`
- [GSAP](https://gsap.com) · [Lenis](https://lenis.darkroom.engineering) · [Vite](https://vite.dev)
