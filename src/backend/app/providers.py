"""평가 에이전트 실행 방식 선택.

`AGENT_PROVIDER` 설정으로 GitHub Copilot SDK 연동과 오프라인 결정적 평가를
선택한다. Copilot을 선택했더라도 CLI나 자격 증명이 없으면 결정적 평가로
안전하게 되돌아간다.
"""

from __future__ import annotations

import logging
from functools import lru_cache

from .evaluation import AreaEvaluator, DeterministicAreaEvaluator, ModelAreaEvaluator, build_area_instructions
from .rubric import RubricArea

logger = logging.getLogger(__name__)


def _copilot_evaluator(model: str, cli_path: str) -> AreaEvaluator:
    from agent_framework.github import GitHubCopilotAgent

    def factory(area: RubricArea) -> GitHubCopilotAgent:
        options: dict[str, str] = {}
        if model:
            options["model"] = model
        if cli_path:
            options["cli_path"] = cli_path
        return GitHubCopilotAgent(
            build_area_instructions(area),
            name=area.agent_name,
            default_options=options or None,
        )

    return ModelAreaEvaluator(factory)


@lru_cache(maxsize=4)
def create_evaluator(provider: str, model: str, cli_path: str) -> AreaEvaluator:
    if provider == "copilot":
        try:
            return _copilot_evaluator(model, cli_path)
        except Exception:  # noqa: BLE001 - 자격 증명 상세는 노출하지 않는다
            logger.warning("Copilot evaluator is unavailable; falling back to the deterministic evaluator")
    return DeterministicAreaEvaluator()
