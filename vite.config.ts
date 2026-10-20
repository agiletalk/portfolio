import { defineConfig } from 'vite'

// 배포 대상은 루트 index.html(Living Terminal) 하나다.
// concepts/ 아래 참고용 시안은 `npm run dev` 후 /concepts/ 에서만 본다.
export default defineConfig({
  base: './',
})
