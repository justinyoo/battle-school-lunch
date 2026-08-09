"""Agent Framework 공식 DevUI 실행 진입점.

`python -m app.devui`로 백엔드 API와 분리된 독립 서버를 띄운다.
"""

from __future__ import annotations

from .main import run_devui

if __name__ == "__main__":
    run_devui()
