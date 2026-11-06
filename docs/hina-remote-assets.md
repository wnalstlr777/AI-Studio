# 히나 원격 애니메이션 업데이트 v1

최초 한 번 **Windows 앱 v1.1.0 이상**을 설치한다. 그 뒤에는 애니메이션 파일과 manifest를
기존 AI-Studio 저장소에 반영하면 앱 재설치 없이 적용된다. v1.0.x 앱은 이 기능이 없다.

## 공개 경로와 지원 상태

- manifest: https://wnalstlr777.github.io/AI-Studio/shared/hina/assets/manifest.json
- 파일: 같은 `shared/hina/assets/` 폴더의 GIF, PNG, APNG, WebP.
- IDLE / WALK / REST / WORK / SUCCESS / ALERT 여섯 상태를 모두 manifest에 유지한다.
- 초기 manifest는 현재 기본 PNG/호흡 모션을 유지한다. 기존의 가끔 인사 GIF도 유지한다.
  원격 IDLE 애니메이션이 바뀌면 기본 호흡·인사 타이머가 이를 덮어쓰지 않는다.
- 전용 모션이 없는 상태는 `complete: false`로 유지한다. 상태 지원은 모션 제작 완료가 아니다.

## 다음 애니메이션을 올리는 방법

1. 새 파일을 `shared/hina/assets/`에 추가한다. `walk-v2.gif`처럼 버전이 들어간 ASCII 파일명을 권장한다.
   기존 웹페이지가 쓰는 `greeting.gif`, `secretary.png`는 삭제하지 않는다.
2. `manifest.json`에서 해당 상태의 `file`을 바꾸고, 직접 확인한 전용 모션만 `complete: true`로 설정한다.
3. 저장소 루트에서 새 버전을 지정해 해시·크기·형식·재생 여부를 갱신한다.

   ```sh
   node desktop/scripts/update-asset-manifest.mjs 2026.11.07.1
   node desktop/scripts/validate-asset-manifest.mjs
   ```

4. 새 파일과 manifest를 같은 커밋으로 main에 반영한다. GitHub Pages 배포가 끝나야 공개된다.
   Pages 워크플로도 manifest와 실제 파일의 형식·용량·해시를 검증하며, 이 검증에 실패하면 배포를 중단한다.
5. 앱은 시작 시 및 실행 중 10분마다 확인한다. GitHub Pages/CDN 전파 이후 다음 검사에서 적용된다.
   애니메이션만 바꿀 때 Windows 앱을 다시 빌드할 필요가 없다.

manifest의 한 항목 예시:

```json
"WALK": {
  "file": "walk-v2.gif",
  "format": "gif",
  "bytes": 123456,
  "sha256": "실제 파일의 소문자 64자리 SHA-256",
  "animated": true,
  "complete": true
}
```

위 bytes/hash는 설명용이며 그대로 사용하면 검증에 실패한다. 갱신 스크립트가 실제 값을 계산한다.
루트의 `schemaVersion`은 1, `version`은 새로운 문자열로 지정한다. 같은 버전의 내용을 바꾸면 앱은 거부한다.

## 적용·실패 처리

- 업데이트 중에도 현재 캐릭터를 계속 표시한다. 여섯 상태의 필요한 파일을 모두 검증한 다음
  IndexedDB 트랜잭션으로 캐시와 활성 버전을 함께 저장하고, 화면의 에셋만 교체한다.
- 같은 SHA-256 파일은 여러 상태에서 공유한다. 현재 캐시/앱 내장 파일을 재사용하며,
  변경된 파일만 원격으로 받는다. 한 파일이 실패해도 같은 검사 후보의 이미 검증한 다운로드는
  메모리에 임시 보관해 다음 재시도에서 재사용한다.
- 다운로드/검증/캐시 저장 실패는 현재 정상 버전을 유지한다. 다음 10분 검사에서 다시 시도한다.
- 다음 앱 시작 시 활성 캐시가 손상됐으면 **이전 정상 버전 → 앱 내장 에셋** 순으로 대체한다.
  앱 데이터를 삭제한 경우에도 내장 에셋으로 실행한다.
- 디스크에는 현재·이전 버전의 Blob만 보관한다. 업데이트 실패 시 임시 다운로드는 메모리에만 남고
  앱 종료/다른 후보 버전 확인 시 정리한다. 과거 파일을 무한히 축적하지 않는다.
- 에셋 오류는 설정 메뉴의 에셋 상태에만 표시하며 Sea QA 실패 알림으로 처리하지 않는다.
  캐릭터 클릭·드래그·트레이·QA 알림 코드는 그대로 사용한다.

## 검증 범위

- HTTPS의 위 GitHub Pages 경로만 허용한다. 다른 호스트, 하위 폴더, `..`/인코딩 우회, query/fragment,
  리디렉션, SVG/HTML은 허용하지 않는다. 인증 정보나 쿠키를 보내지 않는다.
- manifest 최대 64 KiB, 파일 하나 최대 8 MiB, 한 버전의 고유 파일 합계 최대 24 MiB.
  파일명/형식/실제 시그니처/MIME/정확한 바이트 수/SHA-256/이미지 디코딩을 확인한다.
- 최대 가로·세로 4096, 총 8,388,608 픽셀. 15초 요청 제한과 10초 디코딩 제한을 적용한다.
- 변경 없는 manifest는 브라우저 HTTP 캐시 재검증을 사용하고 이미지 파일을 다시 받지 않는다.
- Node 정책·실패 복구 테스트, 브라우저 실제 IndexedDB 테스트와 Windows 네이티브 테스트를 구분한다.
  네트워크 응답은 QA에서 모의하며, 실제 배포 파일의 얼굴·손·루프 품질은 게시자가 확인해야 한다.
  네이티브 QA는 외부 링크 대상을 기록하므로 사용자 기본 브라우저 실행 검수와도 구분한다.

## v1.2 Idle 확장 — 승인 전 검수 시안

새 클라이언트는 `idle-manifest.json` (schemaVersion 2)을 사용한다. 기존 `manifest.json`과
여섯 상태는 변경하지 않아 v1.1 설치본의 업데이트를 깨뜨리지 않는다. 새 Idle 목록을 인식하려면
최초 한 번 v1.2 Windows 앱을 설치해야 한다. **이 저장소 변경은 아직 Windows 빌드·배포하지 않았다.**

v2는 `assets`의 기존 여섯 상태에 `motions`의 여덟 ID를 더한다:
`IDLE_NORMAL`, `IDLE_HAPPY`, `IDLE_THINK`, `IDLE_SURPRISE`, `IDLE_GREETING`,
`IDLE_EXPLAIN`, `IDLE_NOTE`, `IDLE_CHEER`. `CONNECTION_ERROR`는 QA 연결 상태이며 별도 여섯 상태를 변경하지 않는다.

- 모션 메타데이터: 기존 파일/해시/바이트/형식/플래그 외에 `frames`, `durationMs`, `loop`,
  `width:512`, `height:614`, `centerX:256`, `footY:610`을 기록한다.
- 여덟 모션은 모두 현재 `complete:false`이다. 파일이 있다는 것과 외형·동작이 승인됐다는 것은 다르다.
  수동 검수와 명시적인 랜덤 시안 테스트에서는 재생하고, 일상 자동 재생은 승인된 모션만 선택한다.
- 일반 자동 재생: 기본 Idle → 6~15초 뒤 특수 모션 → 기본 복귀. 직전 특수 모션은 연속 선택하지 않는다.
  QA/오류/이동 상태는 수동 검수보다도 우선하며 검수 세션을 종료한다.
- 디코더가 준비된 시점부터 재생 시간을 계산한다. 실제 WebP 프레임 duration에 맞춰 재생·정지한다.
  전체 그림을 CSS로 움직여서 여덟 모션을 대체하지 않는다. 승인된 기본 모션이 없을 때는 기존 PNG 호흡으로 대체한다.
- 기존 `greeting.gif` 자동 타이머와 설정의 '기존 인사 GIF' 버튼을 유지한다.
- v2는 `hina-animation-cache-v2` IndexedDB를 사용한다. 이전 앱의 v1 캐시와 분리한다.
  여섯 상태와 여덟 모션 전체를 해시·실제 캔버스·디코딩·프레임 수·시간 검증 후 한 번에 commit한다.
  일부 손상/다운로드/저장 실패 시 현재 버전 유지, 손상된 캐시는 이전 정상 → 내장 순서로 복구한다.
- 원격 주소·형식·용량·10분 주기·TLS·SHA-256 검증은 기존 제한을 유지한다.

### 재생산과 로컬 검수

```sh
cd desktop
npm ci
npm run prepare:ui
npm test
npm run test:browser
npm run test:idle-browser
node scripts/validate-asset-manifest.mjs
node scripts/validate-asset-manifest.mjs idle-manifest.json
npm run preview
```

미리보기 서버의 `/idle-review.html`은 원본 비교·8종 선택·반복·정지·기준선·랜덤 재생을 제공한다.
앱과 같은 `MotionView`와 `IdlePlayer`를 사용하지만 Windows 입력 검수는 별도로 필요하다.
설정의 캐릭터 검수는 실제 앱 캔버스를 그대로 사용하며 클릭 마스크도 이 캔버스에서 계산한다.

파츠 제작 정의는 `scripts/hina-rig.mjs`, 공통 렌더는 `scripts/render-hina-idles.mjs`이다.
Chromium, ffmpeg, desktop npm 의존성이 필요하다. 원본을 변경하거나 기존 WALK 스크립트를 실행하지 않는다.
원본 픽셀 파츠는 하나의 고정 캔버스에서 강체 회전/이동만 하고, 독립된 `.webp` 여덟 파일로 인코딩한다.
복원 출처와 해결하지 못한 파츠는 `shared/hina/rig/rig.json`에 기록했다.

```sh
cd /workspace/AI-Studio
node scripts/render-hina-idles.mjs
# 저장소 루트에서 로컬 정적 서버를 실행한 뒤 데이터 검수
python -m http.server 8000 --bind 127.0.0.1
# 별도 터미널
node scripts/audit-hina-idles.mjs
node desktop/scripts/validate-asset-manifest.mjs idle-manifest.json
```

인코더가 동일한 연속 프레임을 합칠 수 있어 생성기는 WebP ANMF의 실제 프레임 수·시간을 기록하고, 데이터 검수기는 실제 디코딩 결과로 이를 확인·동기화한다.
최종 파일과 변경된 메타데이터는 같은 커밋으로 검토해야 한다.

### 아트 승인 및 배포 전 남은 검수

- 눈·가려진 몸통 복원은 AI 보완 시안이다. 머리/앞머리/뒷머리, 팔꿈치, 교차한 두 다리,
  손가락/클립보드를 완전히 독립된 리깅 파츠로 복원했다고 주장하지 않는다.
- 메모 모션은 현재 고개와 클립보드 팔의 동작이다. 펜을 쥐고 필기하는 손까지 완성한 모션은 아니다.
- 새 캔버스는 여덟 모션 사이 공통 크기·발 기준을 사용한다. 기존 PNG/WALK/GREETING과의
  정확한 실루엣 전환·관절·숨겨진 어깨 연결부는 사람의 실제 화면 승인이 필요하다.
- 승인한 모션만 `complete:true`로 설정하고 **새 버전**으로 해시/메타데이터를 갱신한다.
  승인되지 않은 시안은 자동으로 main에 push하거나 Pages로 배포하지 않는다.
- v1.2 Windows Actions 빌드 → 실제 EXE 입력·마스크·트레이/자동실행/알림 검수 →
  사용자 승인 → 설치본 제공 및 Pages 배포 → 배포된 HTTPS 바이트/해시/CORS 검증 →
  실행 중인 Windows 앱에서 10분 업데이트와 오프라인 재시작을 확인한다.

### QA 연결 메시지 진단

기존의 공통 '상태를 확인할 수 없어요' 메시지만으로 Windows 원인을 알 수 없다.
설정에 HTTP 상태/요청 제한/시간 초과/네트워크 실패와 다음 재시도 시각을 별도로 표시하도록 개선했다.
한도 초과는 `Retry-After`와 `X-RateLimit-Reset`을 존중하고 2분 기본 주기/최대 30분 백오프를 유지한다.
이미 확인 대기 중인 QA 실패 알림은 일시적인 연결 실패가 덮어쓰지 않는다.

현재 클라우드의 GitHub API 요청은 프록시 CONNECT 단계 HTTP 403으로 차단됐다.
이는 클라우드 네트워크 정책 증거이며 사용자의 Windows 방화벽, GitHub API 한도, 저장소 권한의
원인을 확정하는 증거는 아니다. Windows 설정의 새 진단 메시지와 실제 HTTP 응답을 확인해야 한다.
토큰을 코드에 넣거나 인증서 검증을 끄지 않는다.
