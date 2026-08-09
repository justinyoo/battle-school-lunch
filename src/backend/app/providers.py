"""평가 에이전트 실행 방식 선택.

`AGENT_PROVIDER` 설정으로 Microsoft Foundry 연동과 오프라인 결정적 평가를
선택한다. Foundry를 선택했더라도 프로젝트 엔드포인트와 모델이 없으면
결정적 평가로 안전하게 되돌아간다.
"""

from __future__ import annotations

import logging
from functools import lru_cache

from .evaluation import AreaEvaluator, DeterministicAreaEvaluator, ModelAreaEvaluator, build_area_instructions
from .rubric import RubricArea

logger = logging.getLogger(__name__)


def _foundry_evaluator(project_endpoint: str, model: str) -> AreaEvaluator:
    from agent_framework import Agent
    from agent_framework.foundry import FoundryChatClient
    from azure.identity import DefaultAzureCredential

    client = FoundryChatClient(
        project_endpoint=project_endpoint,
        model=model,
        credential=DefaultAzureCredential(),
    )

    def factory(area: RubricArea) -> Agent:
        return Agent(client=client, name=area.agent_name, instructions=build_area_instructions(area))

    return ModelAreaEvaluator(factory)


@lru_cache(maxsize=4)
def create_evaluator(provider: str, project_endpoint: str, model: str) -> AreaEvaluator:
    if provider == "foundry" and project_endpoint and model:
        try:
            return _foundry_evaluator(project_endpoint, model)
        except Exception:  # noqa: BLE001 - 자격 증명 상세는 노출하지 않는다
            logger.warning("Foundry evaluator is unavailable; falling back to the deterministic evaluator")
    return DeterministicAreaEvaluator()
