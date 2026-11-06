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
   Pages 워크플로도 manifest와 실제 파일을 검증하고, 잘못된 파일이면 배포를 중단한다.
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
