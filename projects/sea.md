# Sea — 프로젝트별 설정

- **저장소:** `wnalstlr777/Sea`
- **엔진:** Three.js 기반 웹 게임
- **첫 QA 대상:** 가두리 및 치어 말풍선
- **관련 파일:** `src/aquaculture.js`, `src/aquaculture-visuals.js`, `src/style.css`
- **적용할 공통 규칙:** `rules/world-ui.md`

## 첫 자동 검수 목표
GitHub Actions에서 Playwright로 Sea 웹 게임을 실행하고 PC·모바일 화면을 검사하며 오류 발생 시 스크린샷과 실행 기록을 보관한다.

거리, 가림, 전체뷰 등을 자동 판정하기 전에는 카메라·캐릭터·치어를 정해진 위치에 배치할 수 있는 테스트용 기능을 추가해야 한다. 실제로 수행하지 않은 검수 항목을 통과로 기록하지 않는다.

## 현재 진행 상태
- 공통 규칙 문서 작성 완료
- Playwright 기본 실행 검수 및 GitHub Actions 설정 완료
- 말풍선 거리·가림·겹침에 대한 자동 회귀 검수는 아직 미구현
- 실제 테스트 성공 여부는 GitHub Actions 실행 결과로 확인해야 함
