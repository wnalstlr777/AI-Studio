# 히나 Idle 재구축 검수 보고서

상태: **검수용 구현 및 8종 시안 준비. 최종 아트·Windows 실기·배포는 미완료.**

## 1. 애니메이션 파일 및 미리보기

[8종 비교 이미지](hina-idles-contact-sheet.png) · [동작 검수 화면](../desktop/dist/idle-review.html) · [검증 기록](hina-idle-validation.json)

검수 화면 실행: `cd desktop && npm run preview` 후 서버의 `/idle-review.html`을 연다. 앱 설정에서도 수동 검수가 가능하며 QA/이동 상태를 우선한다.

| 모션 | 실제 파일 | 디코딩 프레임 | 시간 |
|---|---|---:|---:|
| IDLE_NORMAL | [idle-normal-v1.webp](../shared/hina/assets/idle-normal-v1.webp) | 31 | 3.2초 |
| IDLE_HAPPY | [idle-happy-v1.webp](../shared/hina/assets/idle-happy-v1.webp) | 24 | 2.4초 |
| IDLE_THINK | [idle-think-v1.webp](../shared/hina/assets/idle-think-v1.webp) | 29 | 3.0초 |
| IDLE_SURPRISE | [idle-surprise-v1.webp](../shared/hina/assets/idle-surprise-v1.webp) | 11 | 2.0초 |
| IDLE_GREETING | [idle-greeting-v1.webp](../shared/hina/assets/idle-greeting-v1.webp) | 28 | 2.8초 |
| IDLE_EXPLAIN | [idle-explain-v1.webp](../shared/hina/assets/idle-explain-v1.webp) | 30 | 3.0초 |
| IDLE_NOTE | [idle-note-v1.webp](../shared/hina/assets/idle-note-v1.webp) | 32 | 3.2초 |
| IDLE_CHEER | [idle-cheer-v1.webp](../shared/hina/assets/idle-cheer-v1.webp) | 24 | 2.4초 |

전체 512×614 투명 WebP. 첫·끝 알파 윤곽 동일, 시작·끝 발 기준 610px. 환호만 재생 중 1px 상승한다. 손실 WebP 압축으로 첫·끝 RGB는 바이트 동일하지 않으며, 평균 오차 0~0.625/255이다. 별도 아트 승인 전 `complete:false`를 유지한다.

## 2. 파츠와 복원

- [리깅 정의 및 출처](../shared/hina/rig/rig.json): 머리/얼굴, 몸통/치마, 클립보드 팔, 인사 팔 소매, 손/전완, 다리/신발의 공통 픽셀 파츠 6개와 피벗·레이어 순서를 기록했다.
- [몸통 복원 참고본](../shared/hina/rig/torso-restoration.png), [눈/입 복원 참고본](../shared/hina/rig/face-restoration.png)은 원본과 별도 보관했다. 실제 렌더에서는 가려진 몸통과 얼굴 내부 영역만 제한적으로 합성한다.
- 머리/앞머리/뒷머리, 팔꿈치, 교차한 다리, 클립보드 뒤 손가락을 완전히 독립 복원한 리그는 아니다. 메모는 고개/클립보드 팔의 움직임이며 펜으로 필기하는 손은 미완성이다.
- 원본 `secretary.png`, `greeting.gif`, 기존 `walk.gif`의 SHA-256 모두 유지. 별도 백업은 `/workspace/hina-original-backup/`에 있다.
- 관절 이음새·복원 스타일·기존 PNG/GIF와 새 모션 사이 정렬은 최종 외형 승인 전이다.

## 3. 수정 코드 범위

- `scripts/hina-rig.mjs`, `scripts/render-hina-idles.mjs`, `scripts/audit-hina-idles.mjs`: 공통 파츠·포즈 정의, 실제 WebP 생성, 알파/타이밍/원본 감사.
- `shared/hina/idle-player.js`, `motion-view.js`: 상태와 분리된 Idle 선택, 프레임 디코딩, 반복·정지·복귀.
- `shared/hina/remote-assets-policy.js`, `remote-assets.js`: v2 목록, 실제 모션 검증, 캐시/원자 교체. `state.js`: QA 연결 진단 및 중단 후 응답 억제.
- `desktop/src/app.js`, `index.html`, `style.css`, `idle-review.html`, `idle-review.js`: 앱 입력 마스크·설정·검수 화면.
- `desktop/scripts/build.mjs`, `validate-asset-manifest.mjs`, `update-asset-manifest.mjs`: v2 번들 및 검사/해시 도구.
- `desktop/tests/qa.test.js`, `remote-assets.test.js`, `remote-assets-browser.mjs`, `idle-player.test.js`, `idle-manifest.test.js`, `idle-browser.mjs`: 회귀·모션·atomic 검사.
- `desktop/package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`: 클라이언트 v1.2.0 및 테스트 명령.
- `.github/workflows/hina-desktop.yml`, `pages.yml`: v2 manifest와 새 브라우저 검사를 기존 빌드 검증에 추가.
- `docs/hina-remote-assets.md`, 이 보고서: 재현·검수·승인·업데이트 안내. Sea 게임, QA 워크플로 및 대시보드 기능 재작성 없음.

## 4. 자동 재생과 원격 업데이트

일반 자동 재생은 승인된 모션만 사용한다. 시안은 수동/명시적 랜덤 테스트에서만 재생한다. 6~15초 간격, 직전 특수 모션 중복 회피, 원래 자세 복귀, QA·오류·이동 우선, 실제 프레임 정지/재개를 구현했다. 기존 PNG 호흡·인사 GIF·WALK를 유지했다.

기존 앱용 `manifest.json`은 그대로 유지하고 새 앱은 `idle-manifest.json`과 v2 IndexedDB를 사용한다. 최초 한 번 v1.2 설치가 필요하다. 이후 승인된 에셋 변경은 10분 검사와 SHA-256/크기/실제 프레임·시간 검증 후 원자 교체한다. 일부 손상·저장 실패는 현재 유지, 재시작 시 손상된 현재 캐시는 이전 정상/내장으로 대체한다.

## 5. 검수 결과

- Node 22.23.4: 26개 단위/정책 테스트 통과(9 QA + 8 원격 에셋 + 5 Idle + 4 v2 manifest). UI 빌드 및 v1/v2 파일 서명·해시 검증 통과.
- 기존 브라우저: IDLE/WALK/REST/WORK/ALERT 클릭→드래그→다시 클릭, 알파 마스크, 원격 캐시 복구 8항목 통과.
- 새 브라우저 13항목: 8종 실제 픽셀 변화, 정지/재개, 올바른 pack 활성화, 가짜 프레임/시간/일반상태 SHA alias 거부, 새 canvas 입력, WORK 우선, 연결 장애 시 기존 ALERT 보존 통과.
- 독립 에이전트 코드 검토에서 제기한 타이밍·상태 초기화·atomic 검증 우회 문제를 수정하고 재확인했다. 독립 코드 검토와 실제 브라우저 실행은 구분한다.
- **Windows Tauri EXE 실행, 트레이/자동실행, 실 Win32 클릭·드래그, 사용자 PC 업데이트는 미검수.** 이 환경은 Linux이며 Windows/MSVC/WebView2 실행 환경이 제공되지 않았다.

## 6. QA 연결 오류

클라우드에서 QA API를 읽기 요청했으나 프록시 CONNECT HTTP 403으로 차단됐다. 이는 클라우드 정책 문제를 확인한 것이며, 사용자 Windows 오류의 원인을 확정하지 못했다. 원래 일반 문구만으로는 요청 한도/권한/방화벽/시간 초과를 구분할 수 없었다.

설정에 HTTP 상태·요청 제한·네트워크/시간 초과·재시도 시각을 추가하고, 기존 재시도/ETag/중복 알림 방지를 유지했다. Windows의 실제 진단 값 확인이 남아 있다. 인증 값 요청이나 TLS 검증 해제는 하지 않았다.

## 7–9. 커밋·Actions·배포

로컬 커밋 ID는 최종 응답에 기록한다. GitHub push, Windows Actions 실행, Pages 배포, 설치본 제공은 수행하지 않았다. 따라서 GitHub 커밋/Actions 빌드 성공이나 현재 Windows 앱 반영을 주장하지 않는다.

남은 작업: 미완성 필기 손과 숨겨진 파츠 보완 → 아트/정렬 승인 → Windows v1.2 빌드·실기 검수 → 승인된 결과 push/배포 → 공개 HTTPS 파일·CORS·해시 확인 → 실행 중인 사용자 앱에서 10분 업데이트와 오프라인 복구 검수.
