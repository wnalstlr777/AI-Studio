# MS 사무실 — 히나 Desktop Pet v1.0 구현 초안

Windows 전용 별도 Tauri 2 앱이다. Sea/HINA 게임 코드는 변경하지 않는다.
`../shared/hina/`의 상태·에셋 정의를 대시보드와 공유하고 실행 코드는 분리한다.

## 실행 (Windows 10/11)

Node.js 22 LTS 이상, Rust stable MSVC, Visual Studio C++ Build Tools와 Windows SDK,
Microsoft Edge WebView2 Runtime을 설치한다. [Tauri 준비 사항](https://v2.tauri.app/start/prerequisites/)

```powershell
cd desktop
npm ci
npm run dev
# NSIS 설치 파일: src-tauri/target/release/bundle/nsis/
npm run build
```

수동 Windows 빌드 워크플로 `.github/workflows/hina-desktop.yml`도 추가했다.
워크플로는 실행하거나 배포하지 않았다. 이 환경에는 Rust/Windows가 없어 exe를 생성하지 못했다.
이 소스는 Windows에서 빌드·실행 검증을 거치기 전까지 완성 릴리스가 아니다.

UI만 확인: `npm run preview` → http://127.0.0.1:1420.
브라우저에서는 OS 이동·드래그·트레이·자동 실행·앱 알림이 작동하지 않는다.
공유 로직 검사: `npm test` (추가 의존성 없음).

## 구현 내용

- 투명·테두리 없는 창, 시스템 트레이(설정/화면 복귀/종료), 단일 인스턴스.
- 캐릭터 알파와 표시 중인 UI를 160×210 입력 마스크로 전달한다. 네이티브에서 80ms마다
  커서 위치를 검사해 투명 영역의 입력을 통과시킨다. 창 전체가 통과 중이어도 복귀 가능하다.
  애니메이션 연결 시 마스크는 250ms 간격, 정적 그림은 로드·UI 변경 시에만 갱신한다.
- 클릭: 현재 **Sea QA** 상태 및 에이전트 미연결 안내. 말풍선 클릭: 해당 Actions 실행 열기.
  5px 이상 드래그: OS 창 이동. 우클릭: 설정.
- 15~30초 간격 대기/이동/휴식 상태 선택. WALK 동안에만 120ms 이동 타이머를 사용한다.
  Windows 작업 영역(작업표시줄 제외) 내 하단 이동 및 가장자리 방향 전환. 그림은 좌우 반전만 한다.
  WALK·REST 상태 변경은 전용 애니메이션 완성을 의미하지 않는다.
- 자동 실행은 Tauri autostart 플러그인의 실제 OS 상태를 읽는다. 항상 위·자유 이동·크기·알림은
  로컬 설정으로 유지한다. 종료는 앱 전체를 종료하며 프런트 타이머·요청도 정리한다.
- 알림은 Windows 알림 센터 토스트가 아닌 **별도 Tauri 앱 알림 창**이다. 15초 후 닫히며,
  클릭하면 알림에 연결된 Actions 실행을 연다. 실패 말풍선은 사용자가 확인할 때까지 유지한다.

## QA 연동 정책

- `wnalstlr777/AI-Studio`, `sea-qa.yml`, **main 브랜치**, 최근 30개 실행만 조회한다.
  다른 워크플로/브랜치/HINA/실제 에이전트 상태는 연결하지 않았다.
- 공개 GitHub API 120초 간격(최대 약 30회/시간/클라이언트), ETag 조건부 요청,
  15초 타임아웃, 오류 시 최대 30분 지수 백오프, 403/429 대기 시간을 적용한다.
  IP를 공유하는 웹/앱은 비인증 한도 60회/시간을 함께 사용할 수 있다.
- 조회 요청 자체를 WORK로 표시하지 않는다. GitHub가 queued/in_progress 등을 반환할 때만 WORK.
  success는 SUCCESS, failure/timed_out/startup_failure/action_required는 ALERT.
  cancelled/skipped/neutral/미확인 결론은 성공·실패로 단정하지 않는다.
- 연결 오류는 CONNECTION_ERROR이며 QA 실패 알림을 생성하지 않는다.
- 첫 정상 조회는 과거 실행을 조용히 기준으로 저장한다. 이후 새 완료 이벤트만 반응한다.
  실행 ID·시도 회차·결론을 localStorage에 영속 저장하고 같은 이벤트는 재알림하지 않는다.
  로컬 앱 데이터 삭제 시 기준도 초기화된다. 알림 OFF 중의 이벤트는 나중에 재알림하지 않는다.
- 한 조회에 여러 이벤트가 있으면 실패를 우선 표시하고 나머지도 확인 처리한다.
  기존 실패 확인 전 성공이 들어와도 실패 표시를 유지한다.
  30개보다 많은 실행이 조회 사이에 발생하면 오래된 이벤트가 누락될 수 있다.
- 외부 링크는 이 저장소의 Actions 실행 URL만 허용한다. 인증 토큰은 사용하거나 저장하지 않는다.
  비공개 저장소 인증은 이번 범위에 구현하지 않았다.

## 에셋 현황 / 교체

첨부된 SD 이미지는 대화에서만 확인했다. 다운로드 가능한 원본 이미지·GIF가 작업 공간이나
확인한 AI-Studio 저장소에 없어 **원본 알파, 프레임, 루프, 얼굴·안경·손 일관성 모두 미검수**다.
기존 대시보드의 SVG를 `shared/hina/assets/placeholder.svg`로 분리하여 임시 사용한다.
이 그림은 첨부 원본을 변환한 결과가 아니다. CSS 회전/확대를 전용 동작으로 표시하지 않는다.
IDLE 포함 6종 모두 `complete: false`, 전용 애니메이션 미제작으로 표시한다.

1. 원본 GIF/WebP/APNG를 `shared/hina/assets/`에 넣는다 (원본 보존).
2. `python -m pip install Pillow`, `python scripts/audit-asset.py FILE`로 프레임별 알파·시간·bbox를 확인한다.
   불투명 프레임이 있으면 exit 2. 투명 픽셀 존재만 검사하므로 배경 제거 품질을 보증하지 않는다.
3. 체커보드 배경에서 원본을 재생하고 얼굴/안경/손, 가장자리 잔여 배경, 기준 위치, 2~3초 루프를 검수한다.
   필요한 배경 정리/포맷 변환은 별도 수행한다. 불투명 GIF의 확장자만 바꾸지 않는다.
4. `shared/hina/assets.js`에서 해당 상태의 `src`를 `./assets/파일명`으로 설정한다.
   검수가 끝난 상태만 `complete: true`로 변경한다. 웹·앱이 동일 파일을 사용한다.
5. `npm run prepare:ui`로 배포용 UI를 다시 복사한다.

## 검증 기록

- 통과: Node 핵심 로직 테스트 6개, JS 문법, 정적 UI 복사 빌드.
- Tauri CLI 설치 및 설정 탐지 확인. Rust·Cargo가 없어 네이티브 컴파일 미검수.
- Windows 실행/설치/클릭 통과/드래그/다중 모니터·DPI/자동 실행/알림 클릭/종료 후 프로세스/
  CPU·GPU 실측은 미검수. Windows 빌드 후 이 항목을 짧게 확인해야 한다.
- 원본 GIF 알파 및 전용 6종 애니메이션 미검수/미제작.
- Chromium 화면 캡처는 환경에서 시간 초과되어 실제 화면 검수 미완료.
- 원격 저장소 push, 운영 병합, GitHub Pages 배포는 하지 않았다.

저장소 다운로드가 셸 프록시에서 실패해 GitHub 연결 도구로 원본 커밋
`c420066bbc3704264f8570b9eb628e1b7b740145`의 파일을 로컬에 재구성했다.
로컬 Git의 첫 커밋은 이 스냅샷을 가져온 기록이며 원격 Git 이력의 연속이 아니다.
원격에 반영할 때는 실제 저장소 브랜치에 변경 diff만 적용한다.
