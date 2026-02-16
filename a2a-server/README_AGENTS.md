This folder contains lightweight A2A agent stubs and an orchestrator example.

Agents (A2A endpoints):
- Planner: localhost:8011 (planner_server.py)
- Executor: localhost:8012 (executor_server.py)
- Researcher: localhost:9013 (existing researcher_agent server)
- Validator: localhost:8014 (validator_server.py)

Orchestrator example:
- `orchestrator_a2a.py` calls the above endpoints sequentially and saves a JSON result to `/tmp`.

Run agents (each in its own shell) with:

```bash
python planner_server.py
python executor_server.py
python validator_server.py
# researcher: already available via researcher_agent.server on 9013
```

Then run:

```bash
python orchestrator_a2a.py "Your query here"
```

This setup is intentionally minimal for testing and integration. Replace stubs with real agent implementations (FastA2A/LangGraph/Smolagent/PydanticAI) as needed.
