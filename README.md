# AI-Studio — MS 사무실

- [MS 사무실 대시보드](https://wnalstlr777.github.io/AI-Studio/)
- [히나 Windows 비서 설치 파일·실행 안내](desktop/README.md)
- [Sea QA 설정](projects/sea.md)

## HINA MIND 로컬 미리보기

HINA-AI-CORE와 AI-Studio를 나란히 둡니다. 이미 설치된 CORE Python 환경으로 실제 학습 요약을 내보냅니다.

```bash
# HINA-AI-CORE 저장소 루트
.venv/bin/python -m training.mind_snapshot --watch --output ../AI-Studio/.local/hina-mind.json

# 별도 터미널에서 AI-Studio 저장소 루트
python3 -m http.server 8765 --bind 127.0.0.1
```

같은 컴퓨터의 브라우저에서 `http://127.0.0.1:8765/`를 엽니다. 로컬 피드는 [CORE 스냅샷 형식 v1](https://github.com/wnalstlr777/HINA-AI-CORE/blob/main/schemas/mind-snapshot-v1.schema.json)을 사용합니다. 로컬 집계는 Git에서 제외됩니다. 로컬 파일 없이 열면 공개 집계를 표시합니다.

## HINA MIND 공개 집계 갱신

CORE 루트에서 **공개가 승인된 체크포인트**를 명시해 공개용 파일을 생성합니다.

```bash
.venv/bin/python -m training.mind_snapshot --public \
  --checkpoint 'checkpoints/best(2).npz' \
  --output ../AI-Studio/mind/survival-summary.json

# AI-Studio 저장소 루트
node scripts/validate-mind-summary.mjs
git diff -- mind/survival-summary.json
```

공개 파일은 저장일(UTC), 완료 에피소드 수, 정책 업데이트 수와 최근 탐험 없는 평가의 집계만 포함합니다. 원본 NPZ, 로컬 식별자, 시각, 평가 이력, 개인 기록은 공개 경로 밖에 둡니다. 집계를 검토해 `main`에 반영하면 Pages가 검증 후 배포하고, 열려 있는 대시보드는 1분마다 공개 파일을 재확인합니다. 로컬 감시 모드는 공개 파일을 자동으로 올리지 않습니다.

영역은 `mind/domains.js`에 정의합니다. 실제 데이터가 연결되면 바깥 원에 경험, 안쪽 원에 검증된 능력을 표시합니다. 생존 경험은 100만 에피소드까지 고정 로그 눈금, 정책 평가는 10일까지 고정 선형 눈금을 사용합니다. 상한을 넘으면 원호가 포화되어도 실제 값은 계속 표시됩니다.

Windows 비서의 캐릭터 클릭은 기본 브라우저에서 이 Pages 주소를 엽니다. 데스크톱 창의 화면은 설치본에 포함됩니다. 에셋과 웹 화면의 갱신에는 기존 원격 애니메이션 경로와 Pages를 사용합니다.

## HINA OTA 및 PWA

PC와 모바일의 공용 웹 기능은 [OTA 배포·서명 절차](docs/hina-ota.md)를 따릅니다.
Pages 설치본을 로컬에서 확인하려면 커밋한 소스로 `bash scripts/stage-pages.sh /tmp/hina-web-preview`를 실행한 후 그 디렉터리를 HTTP로 서비스합니다.

## 지금 하는 게임 · 와우 포에버

대시보드는 한국 호드 경매장 스냅샷을 바탕으로 오늘의 재료 파밍·제작·재판매 후보를 짧게 표시합니다. 시세 수집은 매일 오전 6시 23분(KST)에 예약되며, 실제 시작 시각은 GitHub 스케줄러 상황에 따라 달라질 수 있습니다.

- `github-pages` 환경 시크릿에 Battle.net 애플리케이션의 `WOW_BLIZZARD_CLIENT_ID`와 `WOW_BLIZZARD_CLIENT_SECRET`을 설정합니다. 공개 배포 파일에는 수치 요약만 포함합니다.
- 매일 한국 호드 경매장 목록을 조회하고, 일반 매물과 상품 매물의 중복 경매 ID를 제거한 등록 건수가 가장 많은 곳을 고릅니다. 일부 경매장만 읽히면 해당 수집은 완료로 처리하지 않습니다.
- 파밍은 관측된 상위 채집 재료의 개당 예상 수령액을 보여줍니다. 제작은 Forever API에서 재료와 생산량을 검증한 후보만 다루며, 실제 매물의 가격과 수량을 따라 한 번 제작할 재료비를 계산합니다.
- 재판매 후보는 여러 매물이 등록된 거래 재료 중 최저가 물량이 적고 수수료 5%를 뺀 개당 예상 차익이 매입가의 15% 이상인 항목입니다. 기준가는 등록가의 수량 가중 중앙값이며 체결가는 포함되지 않습니다. 수집 실패 시 새 시세를 만들지 않습니다.

[Forever API 경로 참고](https://us.forums.blizzard.com/en/blizzard/t/wow-forever-api-what-works-so-far-plus-a-ts-client/60334) · [시세·제작 자료](https://thott.bot/)
