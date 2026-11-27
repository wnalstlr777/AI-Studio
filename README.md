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

같은 컴퓨터의 브라우저에서 `http://127.0.0.1:8765/`를 엽니다. CORE의 [스냅샷 형식 v1](https://github.com/wnalstlr777/HINA-AI-CORE/blob/main/schemas/mind-snapshot-v1.schema.json)을 사용합니다. 바깥 원은 완료 학습 에피소드 수, 안쪽 원은 마지막 탐험 없는 정책 평가의 평균 생존 일수입니다. 각 원의 한 바퀴 기준은 화면에 표시됩니다. 평가 결과는 해당 체크포인트의 시뮬레이터 성능을 나타냅니다.

연결이 끊기면 마지막 확인 기록에 연결 상태를 표시합니다. 로컬 집계 파일은 Git에서 제외되고, 공개 Pages에는 미연결 상태의 UI가 표시됩니다. 새 애니메이션과 매니페스트는 기존 원격 애니메이션 경로로 배포할 수 있습니다. `shared/hina/assets/`만 변경한 푸시는 Windows EXE 워크플로를 시작하지 않습니다.
