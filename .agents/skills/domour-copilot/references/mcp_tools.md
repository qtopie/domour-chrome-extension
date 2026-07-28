# MCP Tools Reference

## Available Tools

### 1. `browser_navigate`
Navigates the Chrome browser to a target URL, waits for load completion, and extracts page metrics, title, and inner text.

- **Request Schema**:
```json
{
  "name": "browser_navigate",
  "arguments": {
    "url": "https://example.com"
  }
}
```

---

### 2. `browser_get_cookies`
Extracts domain authentication cookies from the user's authentic daily profile context. Sensitive action guarded by UI Privacy Toggle.

- **Request Schema**:
```json
{
  "name": "browser_get_cookies",
  "arguments": {
    "domain": "leetcode.com"
  }
}
```

---

### 3. `browser_take_screenshot`
Captures an active tab screenshot and returns it as a native `image/png` MCP response node, saving up to 99% context tokens for Vision LLMs.

- **Request Schema**:
```json
{
  "name": "browser_take_screenshot",
  "arguments": {
    "url": "https://example.com"
  }
}
```
