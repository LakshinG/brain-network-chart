import datetime, os
from zoneinfo import ZoneInfo
from google.adk.agents import LlmAgent, SequentialAgent
from google.adk.models.lite_llm import LiteLlm

OLLAMA_API_BASE = os.environ.get("OLLAMA_API_BASE", "http://yukon.acm.unc.edu:11434")
PLANNER_MODEL = os.environ.get("PLANNER_MODEL", "ollama_chat/MedAIBase/MedGemma1.5:4b")
EXECUTOR_MODEL = os.environ.get("EXECUTOR_MODEL", "ollama_chat/qwen3:latest")
HOST_MODEL = os.environ.get("HOST_MODEL", "ollama_chat/qwen3:latest")
os.environ.setdefault("OLLAMA_API_BASE", OLLAMA_API_BASE)

def get_weather(city: str) -> dict:
    """Retrieves the current weather report for a specified city.

    Args:
        city (str): The name of the city for which to retrieve the weather report.

    Returns:
        dict: status and result or error msg.
    """
    if city.lower() == "new york":
        return {
            "status": "success",
            "report": (
                "The weather in New York is sunny with a temperature of 25 degrees"
                " Celsius (77 degrees Fahrenheit)."
            ),
        }
    else:
        return {
            "status": "error",
            "error_message": f"Weather information for '{city}' is not available.",
        }


def get_current_time(city: str) -> dict:
    """Returns the current time in a specified city.

    Args:
        city (str): The name of the city for which to retrieve the current time.

    Returns:
        dict: status and result or error msg.
    """

    if city.lower() == "new york":
        tz_identifier = "America/New_York"
    else:
        return {
            "status": "error",
            "error_message": (
                f"Sorry, I don't have timezone information for {city}."
            ),
        }

    tz = ZoneInfo(tz_identifier)
    now = datetime.datetime.now(tz)
    report = (
        f'The current time in {city} is {now.strftime("%Y-%m-%d %H:%M:%S %Z%z")}'
    )
    return {"status": "success", "report": report}


# Planner agent: MedGemma for neuroscience reasoning (no tools)
planner_agent = LlmAgent(
    name="neuro_planner",
    model=LiteLlm(model=PLANNER_MODEL),
    description=(
        "Neuroscience expert that analyzes requests and determines the appropriate "
        "tool configurations for brain network analysis tasks."
    ),
    instruction=(
        "You are an expert in neuroscience and brain network analysis. "
        "Analyze user requests about brain networks, neuroimaging, or related topics. "
        "Provide detailed reasoning about what data or tools are needed, what parameters "
        "should be used, and delegate execution to the executor agent."
    ),
)

# Executor agent: qwen3 with tool calling capability
executor_agent = LlmAgent(
    name="tool_executor",
    model=LiteLlm(model=EXECUTOR_MODEL),
    description=(
        "Executes tools based on the planner's instructions."
    ),
    instruction=(
        "You execute tools based on the neuroscience planner's analysis. "
        "Call the appropriate tools with the specified parameters."
    ),
    tools=[get_weather, get_current_time],
)

# Root agent: coordinates between planner and executor
root_agent = LlmAgent(
    name="root",
    model=LiteLlm(model=HOST_MODEL),
    description=(
        """
        I coordinate neuroscience tool planning and neuroscience tool executing.
        Only tool_executor can call and access tools. 
        I will ask tool_executor what tools to call, then delegate to planner_agent to analyze the user's request and determine the appropriate tool parameters, last pass that information to tool_executor to execute the tools and return results.
        """
    ),
    sub_agents=[planner_agent, executor_agent],
)
