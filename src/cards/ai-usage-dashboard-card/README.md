# AI Usage Dashboard Card

Overview of the 5-hour and weekly quotas for four ChatGPT/Claude usage accounts, with a detail panel,
a comparison row and refresh buttons.

Each account reads `sensor.<prefix>…` and `binary_sensor.<prefix>…` entities from a usage integration and
presses its `refresh` button. The built-in defaults are generic placeholders, so set your own accounts in
the dashboard config (exactly four entries):

```yaml
type: custom:ai-usage-dashboard-card
accounts:
  - name: ChatGPT · Work
    kind: chatgpt
    prefix: chatgpt_usage_
    refresh: button.chatgpt_usage_refresh_usage
  - name: ChatGPT · Private
    kind: chatgpt
    prefix: chatgpt_usage_2_
    refresh: button.chatgpt_usage_2_refresh_usage
  - name: Claude · Work
    kind: claude
    prefix: claude_usage_
    refresh: button.claude_usage_refresh
  - name: Claude · Private
    kind: claude
    prefix: claude_usage_2_
    refresh: button.claude_usage_2_refresh
```
