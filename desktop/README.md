# MS 사무실 — 히나 Desktop Pet v1.0 Windows 빌드

Windows 전용 별도 Tauri 2 앱이다. Sea/HINA 게임 코드는 변경하지 않는다.
`../shared/hina/`의 상태·에셋 정의를 대시보드와 공유하고 실행 코드는 분리한다.

## 설치 파일 다운로드

[Windows x64 설치 파일 Artifact](https://github.com/wnalstlr777/AI-Studio/actions/runs/42157315192/artifacts/13474458702)
(GitHub 로그인 필요). ZIP을 풀고 `히나 비서_1.0.0_x64-setup.exe`를 실행한다.
2026-11-06 Windows Actions에서 빌드·업로드 성공. Artifact 보관 기한: 2026-12-06.
코드 서명은 하지 않았다. Windows 설치·실제 동작 검증은 사용자가 진행한다.

## 소스에서 실행 (Windows 10/11)

Node.js 22 LTS 이상, Rust stable MSVC, Visual Studio C++ Build Tools와 Windows SDK,
Microsoft Edge WebView2 Runtime을 설치한다. [Tauri 준비 사항](https://v2.tauri.app/start/prerequisites/)

```powershell
cd desktop
npm ci
npm run dev
# NSIS 설치 파일: src-tauri/target/release/bundle/nsis/
npm run build
```

Windows 빌드 워크플로 `.github/workflows/hina-desktop.yml`은 수동 실행과
`hina-desktop-v1` 브랜치의 앱 소스 push를 지원한다. main 반영은 PR #1로 완료했다.
빌드 성공과 실제 Windows 실행 검증은 별개이며, 후자는 아직 미검수다.

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

## 검증 기록 (2차 작업)

- [최종 Windows 빌드](https://github.com/wnalstlr777/AI-Studio/actions/runs/42157315192): 성공.
  소스 커밋 `e42b04955df3510f487e44c3b92a8f540123d96a`.
- x64 Release `hina-desktop.exe` 및 NSIS `히나 비서_1.0.0_x64-setup.exe` 생성 확인.
- Artifact `hina-desktop-windows`, ID `13474458702`, 2,014,655 bytes, 업로드 성공.
  ZIP SHA-256: `f344232be1013b1364ae1509fbee2a8cd9e3998f510e4d241d214cadff6bb7b3`.
- [PR #1](https://github.com/wnalstlr777/AI-Studio/pull/1) main 병합 완료.
- Node 핵심 로직 테스트 7개, 정적 UI 복사 빌드 통과.
- Chromium PC(1280px)/모바일(390px) 레이아웃·제목·QA 성공 표시·연결 오류 구분 통과.
  GitHub 응답은 테스트용 데이터로 주입했으며 실제 Sea 게임 QA 통과를 의미하지 않는다.
- 브라우저 점검에서 확인한 fetch receiver 오류를 공유 모듈에서 수정했다.
- 기존 Sea QA 워크플로·테스트 파일·게임 소스는 변경하지 않았다. Sea 게임 QA는 재실행하지 않았다.
- Windows 설치/실행/클릭 통과/드래그/다중 모니터·DPI/자동 실행/알림 클릭/종료 후 프로세스/
  CPU·GPU 실측은 미검수이며 사용자 확인이 필요하다.
- 원본 GIF 알파 및 전용 6종 애니메이션은 미검수/미제작. 기존 임시 SVG 유지.

## 사용자 확인 순서

1. 위 Artifact에서 ZIP을 다운로드하고 설치 파일을 실행한다.
2. 히나 표시·배경 투명·주변 클릭 통과·드래그·이동을 확인한다.
3. 트레이 설정, 항상 위/자유 이동/크기/알림/자동 실행 설정을 확인한다.
4. QA 조회·Actions 링크·새 이벤트 알림을 확인한다 (최초 조회는 과거 이벤트를 호출하지 않는다).
5. 트레이에서 종료한 뒤 히나 프로세스가 정리되는지 확인한다.
6. 실제 GIF 전달 후 에셋 검수·교체를 진행한다.
