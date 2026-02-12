import random, os

from google.adk.agents.llm_agent import Agent
from google.adk.agents.remote_a2a_agent import AGENT_CARD_WELL_KNOWN_PATH
from google.adk.agents.remote_a2a_agent import RemoteA2aAgent
from google.adk.tools.example_tool import ExampleTool
from google.genai import types
from google.adk.tools import exit_loop
from google.adk.agents.callback_context import CallbackContext

from google.adk.agents import LlmAgent, SequentialAgent, LoopAgent, BaseAgent
from google.adk.models.lite_llm import LiteLlm
from mistralai_azure import Any
import pandas as pd
from datetime import datetime
from google.adk.tools import FunctionTool
from google.adk.tools.mcp_tool.mcp_session_manager import StreamableHTTPServerParams
from google.adk.tools.mcp_tool.mcp_toolset import McpToolset
from .schema import *
from google.adk.tools.tool_context import ToolContext
from google.adk.tools.agent_tool import AgentTool
# from google.adk.sessions import InMemorySessionService
# session_service_stateful = InMemorySessionService()

OLLAMA_API_BASE = os.environ.get("OLLAMA_API_BASE", "http://yukon.acm.unc.edu:11434")
HOST_MODEL = os.environ.get("HOST_MODEL", "ollama_chat/qwen3:latest")
os.environ.setdefault("OLLAMA_API_BASE", OLLAMA_API_BASE)

TEST_CASES = [
    """
    study on the correlation between Amyloid and Alzheimer's disease stage, which is denoted by the column DX. Set data_path="Amyloid_SUVR_Swapped.csv"
    """,
    ]


def append_to_state(
    tool_context: ToolContext, field: str, response: str
) -> dict[str, str]:
    """Append new output to an existing state key.

    Args:
        field (str): a field name to append to
        response (str): a string to append to the field

    Returns:
        dict[str, str]: {"status": "success"}
    """
    existing_state = tool_context.state.get(field, [])
    tool_context.state[field] = existing_state + [response]
    print(f"[Added to {field}] {response}")
    return {"status": "success"}


import json
import pandas as pd
import numpy as np

def json_safe_df(df: pd.DataFrame) -> dict:
    # Replace NaN / Inf with None
    df = df.replace({np.nan: None, np.inf: None, -np.inf: None})

    # Convert to records (most JSON-friendly)
    data = df.to_dict(orient="records")

    # Enforce strict JSON compliance
    json.dumps(data, allow_nan=False)

    return data


UPLOAD_DIR = '/ram/USERS/ziquanw/brain-network-chart/uploaded_files'
def read_data_header(tool_context: ToolContext, data_path: str) -> dict:
    """Append the data header to the state var:UPLOADED_DATA.

    Args:
        data_path (str): data_path to read

    Returns:
        dict[str, str]: {"status": "success"}
    """
    df = pd.read_csv(os.path.join(UPLOAD_DIR, data_path), nrows=5)
    df.columns = df.columns.map(str)
    tool_context.state['var:UPLOADED_DATA'] = {'columns': df.columns.tolist(), 'preview': json_safe_df(df)}
    print(f"[Added to var:UPLOADED_DATA] {df.shape}")
    return {"status": "success"}

def print_state(callback_context: CallbackContext):
    return "[state to %s]: %s" % (callback_context.agent_name, callback_context.state)

# from .remote_a2a.planner_agent.agent import ExecutionPlan
planner_agent = LlmAgent(
    name="planner_agent",
    model=LiteLlm(model="ollama_chat/MedAIBase/MedGemma1.5:4b"),
    description="Agent that decides var:TOOL_PARAMETERS for the executor agent based on the user's study query and uploaded data.",
    instruction="""
        You are a neuroimaging statistics planner.

        Task:
        Convert user:STUDY_QUERY + var:UPLOADED_DATA into an executable tool plan in var:TOOL_PARAMETERS.

        Planning policy:
        1) Prefer direct statistical tools first (correlation, group comparison).
        2) If one variable is categorical (e.g., DX) and another is continuous (e.g., Amyloid_*), plan BOTH:
             - analyze_group_comparison(groupColumn=<categorical>, valueColumn=<continuous>)
             - analyze_correlation(xColumn=<continuous>, yColumn=<categorical>, valueMapping=<ordered numeric mapping>)
        3) If there are many candidate biomarker columns (e.g., many Amyloid columns), select one representative column and explain selection briefly in plan notes.
        4) Mapping rule for DX-like stages: {"CN": 0, "EMCI": 1, "LMCI": 1, "MCI": 1, "AD": 2}
             unless explicit study-specific ordering is provided by user.
        5) Use exact column names from var:UPLOADED_DATA.columns.
        6) Output must be executable by executor_agent; do not output prose-only plans.

        Required output format for var:TOOL_PARAMETERS (strict JSON):
        {
            "plan_summary": "short rationale",
            "tool_calls": [
                {
                    "tool": "tool_name",
                    "args": {"key": "value"},
                    "expected_output": "what this tool should return"
                }
            ]
        }

        Example query:
        Study on the correlation between Amyloid and Alzheimer's disease stage, denoted by DX in uploaded data Amyloid_SUVR_Swapped.csv.

        Example plan intent:
        - Choose one representative Amyloid column, e.g. "Amyloid_lS_orbital_med"
        - Call analyze_group_comparison with groupColumn="DX", valueColumn="Amyloid_lS_orbital_med"
        - Call analyze_correlation with xColumn="Amyloid_lS_orbital_med", yColumn="DX", valueMapping={"AD":2,"MCI":1,"LMCI":1,"EMCI":1,"CN":0}

        var:UPLOADED_DATA:
        { var:UPLOADED_DATA? }

        user:STUDY_QUERY:
        { user:STUDY_QUERY? }

        var:TOOL_PARAMETERS:
        { var:TOOL_PARAMETERS? }
    """,
    # output_schema=ExecutionPlan,
    output_key="var:TOOL_PARAMETERS",
    # sub_agents=[executor_agent, researcher_agent, validator_agent],
    # after_agent_callback=print_state
)

# from .remote_a2a.planner_agent.agent import root_agent as planner_agent
# planner_agent = RemoteA2aAgent(
#     name="planner_agent",
#     agent_card=(
#         f"http://localhost:8031/a2a/planner_agent{AGENT_CARD_WELL_KNOWN_PATH}"
#     ),
#     after_agent_callback=print_state
# )
# executor_agent = RemoteA2aAgent(
#     name="executor_agent",
#     # instruction="Agent that executes tools according to tasks from {ExecutionPlan}.",
#     agent_card=(
#         f"http://localhost:8031/a2a/executor_agent{AGENT_CARD_WELL_KNOWN_PATH}"
#     ),
#     after_agent_callback=print_state
# )


executor_agent = LlmAgent(
    model=LiteLlm(model=HOST_MODEL),
    name="executor_agent",
    instruction="""
    1. You execute tools according to var:TOOL_PARAMETERS. 
    2. Then report executed var:TOOL_NAMES and var:RESULTS.
    3. Repeat var:TOOL_PARAMETERS and user:STUDY_QUERY.
    
    var:RESULTS:
    { var:RESULTS? }
    
    var:TOOL_NAMES:
    { var:TOOL_NAMES? }
    
    var:TOOL_PARAMETERS:
    { var:TOOL_PARAMETERS? }
    
    user:STUDY_QUERY:
    { user:STUDY_QUERY? }
    """,
    tools=[
        McpToolset(
        connection_params=StreamableHTTPServerParams(
            url="http://localhost:8010/mcp",
        )
    )
    ],
    # after_agent_callback=print_state
)
researcher_agent = RemoteA2aAgent(
    name="researcher_agent",
    # instruction="Agent that executes tools according to tasks from {ExecutionPlan}.",
    agent_card=(
        f"http://localhost:8013/a2a/researcher_agent{AGENT_CARD_WELL_KNOWN_PATH}"
    ),
    # after_agent_callback=print_state
)
critic = Agent(
    name="critic",
    model=LiteLlm(model=HOST_MODEL),
    description="Reviews the study so that it can be improved.",
    instruction="""
    INSTRUCTIONS:
    Consider these questions about the var:TOOL_PARAMETERS and RESULTS:
    - Does var:TOOL_PARAMETERS grounded from var:UPLOADED_DATA?
    - Does RESULTS show a significant statistic evidence?
    - Do RESULTS answer the studying question?

    If the RESULTS does a good job with these questions, exit the writing loop with your 'exit_loop' tool.
    If significant improvements can be made, use the 'append_to_state' tool to add your feedback to the field 'CRITICAL_FEEDBACK'.
    Explain your decision and briefly summarize the feedback you have provided.

    var:RESULTS:
    { var:RESULTS? }
    
    var:TOOL_NAMES:
    { var:TOOL_NAMES? }
    
    var:TOOL_PARAMETERS:
    { var:TOOL_PARAMETERS? }
    
    var:UPLOADED_DATA:
    { var:UPLOADED_DATA? }
    
    user:STUDY_QUERY:
    { user:STUDY_QUERY? }
    """,
    tools=[append_to_state, exit_loop],
    # after_agent_callback=print_state
)
researcher_room = LoopAgent(
    name="researcher_room",
    description="Iterates through execution and critique to improve a neuroimaging study. Expects var:TOOL_PARAMETERS to be prepared by planner_agent first.",
    sub_agents=[
        executor_agent,
        researcher_agent,
        critic
    ],
    max_iterations=3,
)

plan_then_research = SequentialAgent(
    name="plan_then_research",
    description="Always runs planner_agent first, then enters researcher_room for execution/research/critique.",
    sub_agents=[planner_agent, researcher_room],
)

root_agent = LlmAgent(
    model=LiteLlm(model=HOST_MODEL),
    name="greeting",
    instruction="""
        You are the greeting agent for neuroimaging research requests. Your responsibilities:
        1) Receive a user's neuroimaging research query, use `append_to_state` to add the query to the field 'user:STUDY_QUERY'.
        2) If user uploaded data, check the data structure use `read_data_header` tool to record column names.
        3) Always route to `plan_then_research` so planning happens before research/execution.

        Always ask clarifying questions if the user's request or uploaded data are ambiguous. Do not attempt to execute MCP tools directly without planner output in var:TOOL_PARAMETERS.
        
        var:UPLOADED_DATA:
        { var:UPLOADED_DATA? }
        
        user:STUDY_QUERY:
        { user:STUDY_QUERY? }
    """,
    sub_agents=[plan_then_research],
    tools=[append_to_state, read_data_header],
    generate_content_config=types.GenerateContentConfig(
        safety_settings=[
            types.SafetySetting(  # avoid false alarm about rolling dice.
                category=types.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                threshold=types.HarmBlockThreshold.OFF,
            ),
        ]
    ),
    output_key="var:UPLOADED_DATA",
)