# MS 사무실 — 히나 Desktop Pet v1.1.0 Windows 빌드

Windows 전용 별도 Tauri 2 앱이다. Sea/HINA 게임 코드는 변경하지 않는다.
`../shared/hina/`의 상태·에셋 정의를 대시보드와 공유하고 실행 코드는 분리한다.

## 설치 파일 다운로드

[Windows x64 설치 파일 Artifact](https://github.com/wnalstlr777/AI-Studio/actions/runs/42167051536/artifacts/13480230497)
(GitHub 로그인 필요). ZIP을 풀고 `히나 비서_1.1.0_x64-setup.exe`를 실행한다.
2026-11-06 Windows Actions에서 빌드·업로드 성공. Artifact 보관 기한: 2026-12-06.
코드 서명은 하지 않았다. 실제 Windows 실행 파일의 자동 입력 검수는 통과했다.
설치 마법사와 사용자 PC 환경의 동작은 사용자 확인이 필요하다. 기존 히나를 종료한 뒤 설치한다.

## 재설치 없는 애니메이션 업데이트

**이 버전은 최초 한 번 설치해야 한다.** 이후에는 파일과 manifest만 main에 반영하면
앱 시작 시/실행 중 10분마다 자동 확인한다. 변경 없는 파일은 다시 받지 않는다.
다운로드·SHA-256·형식·크기·디코딩·캐시 저장을 완료한 뒤만 교체하며 실패하면 현재 정상 에셋을 유지한다.
캐시 손상 시 이전 정상 버전, 최종적으로 앱 내장 에셋으로 대체한다.

[원격 에셋 업로드·버전 갱신 안내](../docs/hina-remote-assets.md) ·
[공개 manifest](https://wnalstlr777.github.io/AI-Studio/shared/hina/assets/manifest.json)

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
`hina-desktop-v1` / `hina-input-qa-v1.0.1` / `hina-remote-assets-v1` 브랜치의 앱 소스 push를 지원한다.
원격 업데이트 main 반영은 PR #3로 완료했다. 수동 `reuse_run_id`는 앱 소스가 완전히 같은 경우에만
기존 실행 파일로 네이티브 QA를 재실행하며, 소스가 다르면 중단한다.

UI만 확인: `npm run preview` → http://127.0.0.1:1420.
브라우저에서는 OS 이동·드래그·트레이·자동 실행·앱 알림이 작동하지 않는다.
공유 로직 검사: `npm test` (추가 의존성 없음).

## 구현 내용

- 투명·테두리 없는 창, 시스템 트레이(설정/화면 복귀/종료), 단일 인스턴스.
- 캐릭터 알파와 표시 중인 UI를 160×210 입력 마스크로 전달한다. 네이티브에서 80ms마다
  커서 위치를 검사해 투명 영역의 입력을 통과시킨다. 마스크는 불변 스냅샷으로 읽고
  잠금을 해제한 뒤 창 API를 호출해 UI 스레드와의 교착을 방지한다. 창 전체가 통과 중이어도 복귀 가능하다.
  애니메이션 연결 시 마스크는 250ms 간격, 정적 그림은 로드·UI 변경 시에만 갱신한다.
- 클릭: **MS 사무실 웹페이지** 열기. QA 오류 말풍선·알림 클릭: 해당 Actions 실행 열기.
  5px 이상 드래그: OS 창 이동. 포인터 해제·취소 및 드래그 종료 후 다음 클릭을 유지한다. 우클릭: 설정.
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

## 실제 히나 에셋

사용자가 전달한 `Cheerful Chibi Office Greeting Animation.zip`의 원본을 적용했다.
임시 SVG는 제거했으며 원본 바이트를 재생성·수정하지 않았다.

- `shared/hina/assets/greeting.gif`: 512×512, 6프레임, 각 280ms, 총 1.68초, 무한 반복.
  모든 합성 프레임의 투명 알파·외곽·체커보드 표시를 확인했다. 기본 IDLE에서 가끔 인사할 때 사용한다.
- `shared/hina/assets/secretary.png`: 1145×1373 RGBA 원본.
  WALK/REST/WORK/SUCCESS/ALERT에서는 이 그림과 **전용 모션 미제작** 표시를 사용한다.
  상태 전환 테스트 통과는 이들 전용 애니메이션 제작 완료를 의미하지 않는다.
- 검은 단발·둥근 안경·눈웃음·네이비 정장·스카프·서류철을 원본 그대로 유지한다.
  원본 GIF의 1.68초 길이를 보존했으며 2~3초로 재생성하지 않았다.
- 원본 파일명·크기·프레임별 알파 범위·바이트 동일성·SHA-256은
  `shared/hina/assets/audit.json`에 기록했다.

후속 모션은 `shared/hina/assets/`에 넣고 `shared/hina/assets.js`에서 해당 상태의
`src`, `animated`, `complete`를 바꾼다. 검수가 완료된 모션만 `complete: true`로 설정한다.
알파 검사: `python scripts/audit-asset.py FILE` (Pillow 필요).
`npm run prepare:ui`로 웹과 같은 에셋을 앱 UI에 복사한다.

## 원격 업데이트 검증 (v1.1.0)

- [Windows 빌드·전체 자동 QA](https://github.com/wnalstlr777/AI-Studio/actions/runs/42167051536): 성공.
  소스 `7976323cdc931f941227f46ee6e57ec50ccb5915`. x64 NSIS 생성·Artifact 업로드 성공.
- [QA 결과](https://github.com/wnalstlr777/AI-Studio/actions/runs/42167051536/artifacts/13480305304):
  Node 기존 7개 + 업데이트 8개, Rust 2개, 브라우저·Windows 네이티브 입력 회귀 통과.
- 브라우저 및 실제 Windows 실행 파일에서 각각 실제 IndexedDB·이미지 디코더를 사용해
  새 버전 적용, 변경 파일만 받기, 잘못된 파일 차단, 끊김 복구, 오프라인 재시작,
  손상된 현재 캐시 → 이전 정상 → 내장 에셋 대체를 확인했다.
- Windows Win32 마우스로 원격 업데이트 후 클릭·드래그·다시 클릭 및 기존 상태 전환·알림·종료를 확인했다.
- 자동 QA의 원격 HTTP 응답은 모의하고 10분 주기는 가상 시계로 확인했다.
  실제 GitHub Pages 배포 후 공개 HTTPS manifest 내용·CORS 헤더와 배포된 파일 해시를 별도 확인했다.
- 설치 마법사 실행, 사용자 PC 기본 브라우저 실행, 장시간 상주·자원 사용·다중 모니터는 별도 확인 대상이다.
- 기존 Sea QA 코드와 웹 대시보드 실행 코드는 변경하지 않았다.

## 이전 검증 기록 (v1.0.1)

- [Windows 설치 파일 빌드·업로드](https://github.com/wnalstlr777/AI-Studio/actions/runs/42162388912):
  x64 Release / NSIS 생성 성공. 빌드 소스 `6612b70b08cf44e2917f9b009ee7c7e29b1c2370`.
  이 실행의 초기 네이티브 테스트는 검사기 시작 타이밍 문제로 실패했으며 아래 최종 실행으로 확인했다.
- [최종 자동 QA 실행](https://github.com/wnalstlr777/AI-Studio/actions/runs/42163107717): **성공**.
  생성된 실행 파일과 현재 앱 소스가 같은지 먼저 검증해 재컴파일 없이 테스트했다.
- [검수 결과 Artifact](https://github.com/wnalstlr777/AI-Studio/actions/runs/42163107717/artifacts/13477199769):
  GIF 프레임 알파, 브라우저 테스트 결과, Windows 네이티브 JSON·스크린샷 포함.
- Node 7개: 실제 QA 상태, 중복 방지, 네트워크 오류, API 제한, fetch 호출 회귀 통과.
- Rust 2개: 잠금 스냅샷 재진입 2,000회 및 알파·DPI 좌표 매핑 통과.
- 브라우저: IDLE/WALK/REST/WORK/ALERT 각각 클릭→드래그→다시 클릭, 오류 상세 URL,
  원본 GIF 및 투명/불투명 입력 마스크 확인. **Tauri IPC 모의 테스트**로 구분한다.
- Windows 네이티브: 실제 실행 파일에 **Win32 마우스 입력**을 보내 클릭, 창 드래그,
  드래그 후 클릭 복구, 투명 영역에서 재진입, 다섯 상태 전환 후 클릭 유지 확인.
  오류 말풍선·네이티브 알림의 Actions URL 및 앱 종료 코드 0 확인.
- 네이티브 QA는 `HINA_NATIVE_QA=1`에서 검사 포트를 열고 외부 링크 대상을 기록한다.
  실제 외부 브라우저 실행은 생략하므로 사용자 기본 브라우저 실행 성공을 의미하지 않는다.
  테스트용 QA 응답을 주입하며 실제 Sea QA 결과나 에이전트 상태를 조작하지 않는다.
  일반 실행은 이 모드를 사용하지 않는다.
- 웹 대시보드 PC/모바일 레이아웃·실제 히나 이미지·QA 성공/연결 오류 구분 확인.
  기존 Sea QA 워크플로·테스트·게임 소스는 변경하지 않았다. Sea 게임 QA는 재실행하지 않았다.
- 설치 마법사 실행, 사용자 PC의 기본 브라우저·자동 실행·다중 모니터·고DPI·장시간 상주·
  CPU/GPU 실측은 이번 자동 검수 범위가 아니다.

## 사용자 확인 순서

1. 기존 히나를 트레이에서 종료한다. 먹통이면 작업 관리자에서 `hina-desktop.exe`를 종료한다.
2. 위 Artifact의 ZIP을 풀고 `히나 비서_1.1.0_x64-setup.exe`를 실행한다.
3. 실제 히나 표시·주변 클릭 통과·드래그 후 클릭·MS 사무실 열기를 확인한다.
4. 오류 알림에서 해당 Actions 기록이 열리는지, 트레이 종료 후 앱이 끝나는지 확인한다.
