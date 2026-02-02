from mcp.server.fastmcp import FastMCP
from starlette.requests import Request
from starlette.responses import PlainTextResponse
from pydantic_ai import Agent
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.ollama import OllamaProvider

server = FastMCP('Pydantic AI Server',
                 host='yukon.acm.unc.edu', port=8010)

ollama_model = OpenAIChatModel(
    model_name='qwen3:latest',
    provider=OllamaProvider(base_url='http://yukon.acm.unc.edu:11434/v1'),  
)

server_agent = Agent(
    ollama_model, instructions='always reply in rhyme'
)


@server.tool()
async def poet(theme: str) -> str:
    """Poem generator"""
    r = await server_agent.run(f'write a poem about {theme}')
    return r.output



@server.custom_route("/health", methods=["GET"])
async def health_check(request: Request) -> PlainTextResponse:
    return PlainTextResponse("OK")

if __name__ == "__main__":
    server.run(transport="streamable-http", mount_path='/ram/USERS/ziquanw/brain-network-chart/uploaded_files') 
    