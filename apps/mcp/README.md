# MetaBreath MCP Server

Model Context Protocol server that exposes MetaBreath health data to Claude AI.

## Setup

```bash
cd apps/mcp
pip install mcp[server] httpx
```

## Tools

| Tool | Description |
|------|-------------|
| `get_recent_readings` | Fetch breath acetone readings by device |
| `get_metabolic_trend` | 7-day trend prediction (slope + direction) |
| `explain_reading` | Plain-language explanation of acetone ppm value |
| `log_meal` | Log meal entry |
| `log_activity` | Log activity entry |
| `calibrate_device` | Trigger device zero-point calibration |

## Resources

- `metabreath://reference/acetone-ranges` — Metabolic state reference ranges
- `metabreath://reference/tgs1820-datasheet` — Sensor specs and cross-sensitivity

## Prompts

- `analyze_metabolic_state` — Full metabolic analysis with recent data
- `daily_coaching_message` — Personalised daily coaching

## Claude Desktop Integration

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "metabreath": {
      "command": "python",
      "args": ["-m", "apps.mcp.src.server"],
      "env": {
        "METABREATH_API_URL": "http://localhost:8000",
        "METABREATH_API_TOKEN": "<your_token>"
      }
    }
  }
}
```
