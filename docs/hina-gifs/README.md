# 히나 공용 GIF 3종 검수

| IDLE | ALERT | NEWS |
|---|---|---|
| ![대기](../../shared/hina/assets/hina-idle.gif) | ![실제 오류](../../shared/hina/assets/hina-alert.gif) | ![새 소식](../../shared/hina/assets/hina-news.gif) |
| 8프레임 / 1.76초 반복 | 8프레임 / 1.44초 반복 | 8프레임 / 1.60초 1회 |

- [24프레임 비교](contact-sheet.png), [움직이는 로컬 미리보기](preview.html), [PC](web-pc.png), [모바일](web-mobile.png).
- 512×614 투명 GIF. 기준 신장 480px, 발 Y=610, 중심 X=256(픽셀 반올림 ±1px).
  손짓/말풍선 효과가 오른쪽으로 뻗는 프레임도 잘리지 않도록 같은 기준 신장을 사용했다.
  ALERT 기준 배율은 IDLE/NEWS보다 약 1.9% 키워 세 동작의 기본 신장을 맞췄다.
- 기준 프레임의 가시 폭은 IDLE 272px, ALERT 292px, NEWS 270px이다. 원본의 머리·몸 비율 차이는 남아 있으며, 이를 없애기 위해 신체를 비선형 변형하지 않았다. 기준 신장·발·중심 정렬과 별도로 시각 승인이 필요하다.
- 원본 IDLE의 고개 움직임은 보존했다. 머리·몸·팔을 비선형 변형하거나 프레임을 재생성하지 않았다.
- 원본 ZIP은 [sources/hina](../../sources/hina/hina_3_gifs_original.zip)에 별도 보존했다.
  `scripts/normalize-hina-gifs.mjs`가 원본의 8프레임/시간을 유지하여 정렬 GIF와 manifest를 갱신한다.

## 상태와 호환성

기존 manifest의 여섯 상태 키는 그대로다. NEWS 표시만 기존 SUCCESS 슬롯의 `hina-news.gif`를 재사용한다.
새 클라이언트는 실제 새 QA 성공 결과 또는 `hina:news`의 새 ID를 NEWS로 표시한다.
예전 여섯 상태 클라이언트는 SUCCESS로 같은 GIF를 표시할 수 있으며, 8종 Idle 목록은 변경하지 않았다.

실제 QA 실패는 ALERT, GitHub 연결/403 실패는 CONNECTION_ERROR로 구분한다.
이미 확인한 소식은 저장된 ledger로 중복 재생하지 않는다. NEWS는 로딩 완료 후 한 번 재생하고 IDLE로 복귀한다.
새 소식이 연속 도착하면 검증된 Blob을 재사용해 첫 프레임부터 시작하며 같은 파일을 반복 다운로드하지 않는다.
기존 5분 QA 조회/영속 캐시/요청 제한과 10분 에셋 확인을 유지한다.
새 설치본보다 오래된 날짜의 운영 manifest가 검수본을 과거 PNG로 되돌리는 것도 차단한다.

공용 GIF의 크기·해시·버전 갱신 후 두 manifest를 함께 반영한다:

```sh
node desktop/scripts/update-asset-manifest.mjs NEW_VERSION manifest.json
node desktop/scripts/update-asset-manifest.mjs NEW_VERSION idle-manifest.json
```

첫 명령이 웹용 번들 메타데이터도 생성한다. 웹과 Windows는 같은 세 파일을 사용한다.
이후 운영에 반영된 에셋 변경은 재설치 없이 검사·캐시·원자 교체된다. NEWS 표시 코드가 없는 기존 앱은 최초 1회 새 클라이언트 설치가 필요하다.

## 테스트

```sh
cd desktop
npm test
npm run test:shared-gifs
npm run test:browser
npm run test:idle-browser
```

운영에는 테스트 버튼을 추가하지 않았다. 로컬 웹 또는 앱 URL에 `?hinaTest=1`을 붙인 경우만
개발자 콘솔의 `hinaPreviewState('IDLE'|'ALERT'|'NEWS')`로 실제 렌더러를 확인할 수 있다.
`hinaPreviewState(null)`로 해제한다. 그 외 URL에서는 함수가 노출되지 않는다.
작업 결과 연동은 `window.dispatchEvent(new CustomEvent('hina:news',{detail:{id:'고유-결과-ID'}}))`를 사용한다.
다른 부서 에이전트나 외부 뉴스 백엔드를 새로 연결한 것은 아니다.

검수 브랜치의 Windows CI가 성공한 설치본만 제공한다. 사용자 PC 확인과 정렬본 운영 반영 승인은 별도다.

## 검수 결과 및 설치본

- 커밋 `09ab79b` / 검수 브랜치 `hina-shared-gifs-v1`. 운영 main과 Pages는 변경하지 않았다.
- Node 33개, 공용 GIF 브라우저 10항목, 기존 입력·캐시 복구 및 8종 Idle/403 브라우저 17항목 통과.
- [Windows 빌드·실제 EXE 검사](https://github.com/wnalstlr777/AI-Studio/actions/runs/42941572835) 성공 (6분 55초).
  실제 EXE에서 3종 GIF 표시와 NEWS→IDLE 복귀, 기존 입력·원격 캐시·8종/403 회귀를 확인했다.
- [검수용 v1.3.0 설치 ZIP (15.3 MB)](https://github.com/wnalstlr777/AI-Studio/actions/runs/42941572835/artifacts/13820663885), GitHub 로그인 필요.
  기존 히나 종료 후 설치하며 사용자 PC의 실제 표시 확인은 남아 있다.
- ZIP SHA-256: `0db31600b85919545351efac96e769fa7cad94b3092e02d7b5488c9cabab57a4`.
- 외부 이벤트는 같은 id를 재생하지 않는다. 다른 새 id는 캐시 Blob으로 첫 프레임부터 다시 시작한다.
- 운영 반영은 AGENTS.md의 “사용자 승인 전에는 GitHub 운영 에셋 교체·배포를 하지 않는다”에 따라 미리보기 확인 후 진행한다.
