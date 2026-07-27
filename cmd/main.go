package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"os"
)

type JSONRPCRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      interface{}     `json:"id"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

type JSONRPCResponse struct {
	JSONRPC string      `json:"jsonrpc"`
	ID      interface{} `json:"id"`
	Result  interface{} `json:"result,omitempty"`
	Error   interface{} `json:"error,omitempty"`
}

type CallToolParams struct {
	Name      string                 `json:"name"`
	Arguments map[string]interface{} `json:"arguments"`
}

func main() {
	// Stdio MCP Server Runner for CLI / IDEs
	scanner := bufio.NewScanner(os.Stdin)
	for scanner.Scan() {
		line := scanner.Bytes()
		if len(bytes.TrimSpace(line)) == 0 {
			continue
		}
		resp := processJSONRPC(line)
		if resp != nil {
			fmt.Println(string(resp))
		}
	}
}

func processJSONRPC(reqBytes []byte) []byte {
	var req JSONRPCRequest
	if err := json.Unmarshal(reqBytes, &req); err != nil {
		errResp, _ := json.Marshal(JSONRPCResponse{
			JSONRPC: "2.0",
			Error: map[string]interface{}{
				"code":    -32700,
				"message": "Parse error",
			},
		})
		return errResp
	}

	switch req.Method {
	case "initialize":
		res, _ := json.Marshal(JSONRPCResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Result: map[string]interface{}{
				"protocolVersion": "2024-11-05",
				"capabilities": map[string]interface{}{
					"tools": map[string]interface{}{},
				},
				"serverInfo": map[string]interface{}{
					"name":    "cosmos-stdio-mcp-cli",
					"version": "1.0.0",
				},
			},
		})
		return res

	case "notifications/initialized":
		return nil

	case "tools/list":
		res, _ := json.Marshal(JSONRPCResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Result: map[string]interface{}{
				"tools": []map[string]interface{}{
					{
						"name":        "browser_navigate",
						"description": "Navigate browser via COSMOS Bridge Stdio MCP.",
						"inputSchema": map[string]interface{}{
							"type": "object",
							"properties": map[string]interface{}{
								"url": map[string]interface{}{"type": "string"},
							},
							"required": []string{"url"},
						},
					},
					{
						"name":        "browser_get_cookies",
						"description": "Extract cookies via COSMOS Bridge Stdio MCP.",
						"inputSchema": map[string]interface{}{
							"type": "object",
							"properties": map[string]interface{}{
								"domain": map[string]interface{}{"type": "string"},
							},
							"required": []string{"domain"},
						},
					},
				},
			},
		})
		return res

	case "tools/call":
		res, _ := json.Marshal(JSONRPCResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Result: map[string]interface{}{
				"content": []map[string]interface{}{
					{
						"type": "text",
						"text": "Execution triggered via Stdio MCP CLI",
					},
				},
			},
		})
		return res

	default:
		res, _ := json.Marshal(JSONRPCResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Error: map[string]interface{}{
				"code":    -32601,
				"message": "Method not found",
			},
		})
		return res
	}
}
