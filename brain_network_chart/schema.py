
from pydantic import BaseModel, Field

class DataSchema(BaseModel):
    """The schema of an input parameter used Tool schema."""

    name: str = Field(description="The name of the parameter.")
    type: str = Field(description="The type of the parameter (e.g., string, integer).")
    min_value: float = Field(description="Minimum value for numeric parameters so that it is valid for the tool.")
    max_value: float = Field(description="Maximum value for numeric parameters so that it is valid for the tool.")
    
class ToolSchema(BaseModel):
    """Tool information for the Planner's output schema."""

    name: str = Field(description="The name of the tool to call in the executor.")
    params: list[DataSchema] = Field(
        description="A list of schema of input parameters used by the tool."
    )
    
class ResponseSchema(BaseModel):
    """The schema of the interactive_neuroimaging_agent's output, which informs the sub_agents and routes responses from sub_agents."""

    query: str = Field(
        description="Precise summary showing understanding of the user's query"
    )
    response: str = Field(
        description="The response to the user."
    )
    tools: list[ToolSchema] = Field(
        description="A list of tools are available for planner_agent to plan with. Each tool has a name and a list of input parameters with schema defined."
    )
    data_header: list[DataSchema] = Field(
        description="A list of data schema in the uploaded data, if any. This is for planner_agent to understand the structure of the data and plan accordingly. If no data is uploaded, this will be an empty list."
    )
    