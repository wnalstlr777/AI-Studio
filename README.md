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
