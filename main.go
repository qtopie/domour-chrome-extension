package main

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// ChromeMessage defines the format of JSON packets exchanged between Go and Chrome
type ChromeMessage struct {
	Type   string `json:"type"`
	Token  string `json:"token,omitempty"`
	Action string `json:"action,omitempty"`
	URL    string `json:"url,omitempty"`
	Status string `json:"status,omitempty"`
	Data   string `json:"data,omitempty"`
	Level  string `json:"level,omitempty"`
	Msg    string `json:"message,omitempty"`
}

// Job defines the format of the job payload
type Job struct {
	Token  string `json:"token"`
	Action string `json:"action"`
	URL    string `json:"url"`
}

// VproxyProfilePayload defines proxy profile format
type VproxyProfilePayload struct {
	ID         string   `json:"id,omitempty"`
	Name       string   `json:"name"`
	Mode       string   `json:"mode"`
	Scheme     string   `json:"scheme,omitempty"`
	Host       string   `json:"host,omitempty"`
	Port       int      `json:"port,omitempty"`
	BypassList []string `json:"bypassList,omitempty"`
	PacType    string   `json:"pacType,omitempty"`
	PacURL     string   `json:"pacUrl,omitempty"`
	PacScript  string   `json:"pacScript,omitempty"`
	Color      string   `json:"color,omitempty"`
}

type VproxySyncFile struct {
	Token        string                 `json:"token,omitempty"`
	Profiles     []VproxyProfilePayload `json:"profiles"`
	AutoSelectID string                 `json:"autoSelectId,omitempty"`
}

// MCP JSON-RPC Protocol Structs
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

type MCPTool struct {
	Name        string      `json:"name"`
	Description string      `json:"description"`
	InputSchema interface{} `json:"inputSchema"`
}

type CallToolParams struct {
	Name      string                 `json:"name"`
	Arguments map[string]interface{} `json:"arguments"`
}

var (
	validToken       string
	tokenLock        sync.RWMutex
	writeMu          sync.Mutex
	logFile          *os.File
	pendingResponseMu sync.Mutex
	pendingResponseChan chan ChromeMessage
)

func main() {
	pendingResponseChan = make(chan ChromeMessage, 10)

	var err error
	logFile, err = os.OpenFile("bridge.log", os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
	if err != nil {
		log.SetOutput(os.Stderr)
	} else {
		defer logFile.Close()
		log.SetOutput(logFile)
	}

	log.Println("Bridge started. Waiting for INITIAL_AUTH on Stdin...")

	// 1. Initial Authentication Phase
	for {
		msgBytes, err := readMessage(os.Stdin)
		if err != nil {
			log.Fatalf("Error reading initial auth message: %v", err)
		}

		var msg ChromeMessage
		if err := json.Unmarshal(msgBytes, &msg); err != nil {
			log.Printf("Failed to parse initial auth message: %v", err)
			continue
		}

		if msg.Type == "INITIAL_AUTH" {
			if msg.Token == "" {
				log.Println("Received INITIAL_AUTH with empty token.")
				continue
			}
			tokenLock.Lock()
			validToken = msg.Token
			tokenLock.Unlock()
			log.Printf("Successfully authenticated. Token locked: %s", msg.Token)
			sendSystemLog("info", "Bridge authenticated and token locked.")
			break
		}
	}

	// 2. Start Keep-Alive Heartbeat
	go startHeartbeat()

	// 3. Start Polling for legacy file jobs & vproxy sync
	go startFilePolling()
	go startVproxyPolling()

	// 4. Embedded Streamable HTTP MCP Server
	go startEmbeddedMCPServer(26888)

	// 5. Main Event Loop: Native Messaging Pipe Reader
	for {
		msgBytes, err := readMessage(os.Stdin)
		if err != nil {
			if err == io.EOF {
				log.Println("Chrome closed connection. Exiting bridge.")
				break
			}
			log.Printf("Error reading message: %v", err)
			continue
		}

		var msg ChromeMessage
		if err := json.Unmarshal(msgBytes, &msg); err != nil {
			log.Printf("Failed to unmarshal message: %v", err)
			continue
		}

		if msg.Type == "JOB_RESPONSE" {
			log.Printf("Job response received. URL=%s, Status=%s", msg.URL, msg.Status)
			// Write response to file for CLI
			writeJobResponse(msg)
			// Non-blocking dispatch to MCP channel
			select {
			case pendingResponseChan <- msg:
			default:
			}
		} else if msg.Type == "TRIGGER_VPROXY_SYNC" {
			triggerVproxyScan()
		}
	}
}

// Memory Job Dispatcher directly sends payload to Chrome via Native Pipe
func dispatchJobToBrowser(action, targetURL string, extra ...map[string]string) (ChromeMessage, error) {
	tokenLock.RLock()
	currentValidToken := validToken
	tokenLock.RUnlock()

	jobPayload := map[string]string{
		"type":   "JOB_REQUEST",
		"token":  currentValidToken,
		"action": action,
		"url":    targetURL,
	}
	if len(extra) > 0 && extra[0] != nil {
		for k, v := range extra[0] {
			jobPayload[k] = v
		}
	}

	payloadBytes, err := json.Marshal(jobPayload)
	if err != nil {
		return ChromeMessage{}, err
	}

	log.Printf("Dispatching in-memory job to Chrome: Action=%s, URL=%s", action, targetURL)
	sendSystemLog("info", "Executing memory MCP job. Action: %s, URL: %s", action, targetURL)

	if err := writeMessage(os.Stdout, payloadBytes); err != nil {
		return ChromeMessage{}, fmt.Errorf("failed to write message to Chrome pipe: %v", err)
	}

	// Wait for response on internal channel with 15s timeout
	select {
	case res := <-pendingResponseChan:
		return res, nil
	case <-time.After(15 * time.Second):
		return ChromeMessage{}, fmt.Errorf("timeout waiting for Chrome extension execution")
	}
}

// Embedded Streamable HTTP MCP Server (/mcp)
func startEmbeddedMCPServer(port int) {
	http.HandleFunc("/mcp", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == "OPTIONS" {
			return
		}

		// Check Token authentication if validToken is locked in memory
		currentValidToken := validToken
		if currentValidToken != "" {
			authHeader := r.Header.Get("Authorization")
			tokenParam := r.URL.Query().Get("token")
			providedToken := ""

			if strings.HasPrefix(authHeader, "Bearer ") {
				providedToken = strings.TrimPrefix(authHeader, "Bearer ")
			} else if tokenParam != "" {
				providedToken = tokenParam
			}

			if providedToken != currentValidToken {
				http.Error(w, `{"error":"Unauthorized: Invalid Token"}`, http.StatusUnauthorized)
				return
			}
		}

		if r.Method == "POST" {
			body, err := io.ReadAll(r.Body)
			if err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}

			resp := processJSONRPC(body)
			if resp != nil {
				w.Header().Set("Content-Type", "application/json")
				w.Write(resp)
			}
			return
		}

		if r.Method == "GET" {
			w.Header().Set("Content-Type", "text/event-stream")
			w.Header().Set("Cache-Control", "no-cache")
			w.Header().Set("Connection", "keep-alive")

			flusher, ok := w.(http.Flusher)
			if !ok {
				http.Error(w, "Streaming unsupported", http.StatusInternalServerError)
				return
			}

			fmt.Fprintf(w, "event: endpoint\ndata: /mcp\n\n")
			flusher.Flush()
			select {}
		}
	})

	http.HandleFunc("/proxy.pac", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/x-ns-proxy-autoconfig")
		w.Header().Set("Access-Control-Allow-Origin", "*")

		homeDir, _ := os.UserHomeDir()
		vproxyCfgPath := filepath.Join(homeDir, ".vproxy", "config.json")

		defaultUpstream := "SOCKS5 192.168.50.31:1080; SOCKS5 192.168.50.189:1080; SOCKS5 127.0.0.1:1080"
		defaultDomains := []string{
			"google.com", "gstatic.com", "googleapis.com", "1e100.net", "gmail.com",
			"googleusercontent.com", "youtube.com", "youtu.be", "ggpht.com", "ytimg.com",
			"googlevideo.com", "wikimedia.org", "live.com", "githubusercontent.com", "github.com",
		}

		proxyString := defaultUpstream
		var matchedDomains []string

		if cfgData, err := os.ReadFile(vproxyCfgPath); err == nil {
			var cfg struct {
				Upstreams []string `json:"upstreams"`
				Rules     []string `json:"rules"`
			}
			if err := json.Unmarshal(cfgData, &cfg); err == nil {
				// 1. Dynamic Upstreams
				var pacProxies []string
				for _, up := range cfg.Upstreams {
					upStr := up
					if idx := strings.Index(upStr, "://"); idx != -1 {
						scheme := strings.ToUpper(upStr[:idx])
						addr := upStr[idx+3:]
						if scheme == "SOCKS5" || scheme == "SOCKS" {
							pacProxies = append(pacProxies, fmt.Sprintf("SOCKS5 %s; SOCKS %s", addr, addr))
						} else if scheme == "HTTP" || scheme == "HTTPS" {
							pacProxies = append(pacProxies, fmt.Sprintf("PROXY %s", addr))
						}
					}
				}
				if len(pacProxies) > 0 {
					proxyString = strings.Join(pacProxies, "; ")
				}

				// 2. Dynamic Domain Rules
				for _, rule := range cfg.Rules {
					parts := strings.Split(rule, ",")
					if len(parts) == 2 && parts[1] == "PROXY" && parts[0] != "DEFAULT" && !strings.HasPrefix(parts[0], "PROCESS") {
						matchedDomains = append(matchedDomains, parts[0])
					}
				}
			}
		}

		if len(matchedDomains) == 0 {
			matchedDomains = defaultDomains
		}

		// Escape domain strings for regex
		var regexConditions []string
		for _, d := range matchedDomains {
			escapedDomain := strings.ReplaceAll(d, ".", "\\.")
			regexConditions = append(regexConditions, fmt.Sprintf("        if (/(?:^|\\.)%s$/.test(host)) return \"+proxy\";", escapedDomain))
		}

		regexBlock := strings.Join(regexConditions, "\n")

		pacScript := fmt.Sprintf(`function isPlainHostName(host) {
    return host.indexOf('.') === -1;
}

var FindProxyForURL = function(init, profiles) {
    return function(url, host) {
        "use strict";
        var result = init, scheme = url.substr(0, url.indexOf(":"));
        do {
            result = profiles[result];
            if (typeof result === "function") result = result(url, host, scheme);
        } while (typeof result !== "string" || result.charCodeAt(0) === 43);
        return result;
    };
}("+auto switch", {
    "+auto switch": function(url, host, scheme) {
        "use strict";
        // LAN & Localhost Bypass Rules (Never use proxy for intranet)
        if (!host || isPlainHostName(host) || host === '127.0.0.1' || host === 'localhost' || host === '::1' || /(?:^|\.)local$/.test(host)) return "DIRECT";
        if (/^(?:10|127|192\.168|172\.(?:1[6-9]|2[0-9]|3[01]))\./.test(host)) return "DIRECT";

%s
        return "DIRECT";
    },
    "+proxy": function(url, host, scheme) {
        "use strict";
        return "%s";
    }
});`, regexBlock, proxyString)

		w.Write([]byte(pacScript))
	})

	log.Printf("Embedded Streamable HTTP MCP Server started on http://localhost:%d/mcp", port)
	_ = http.ListenAndServe(fmt.Sprintf(":%d", port), nil)
}

func getToolsList() []MCPTool {
	return []MCPTool{
		{
			Name:        "browser_navigate",
			Description: "Navigate browser to a target URL and return title, inner text, and page metrics.",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"url": map[string]interface{}{
						"type":        "string",
						"description": "The web URL to open and scrape",
					},
				},
				"required": []string{"url"},
			},
		},
		{
			Name:        "browser_navigate_back",
			Description: "Go back to the previous page in history on the active browser tab.",
			InputSchema: map[string]interface{}{
				"type":       "object",
				"properties": map[string]interface{}{},
			},
		},
		{
			Name:        "browser_click",
			Description: "Click on an element on the webpage matching the CSS selector or text description.",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"url": map[string]interface{}{
						"type":        "string",
						"description": "Target Web URL",
					},
					"selector": map[string]interface{}{
						"type":        "string",
						"description": "CSS selector or element text to click",
					},
				},
				"required": []string{"url", "selector"},
			},
		},
		{
			Name:        "browser_type",
			Description: "Type text into an input field or element matching the CSS selector.",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"url": map[string]interface{}{
						"type":        "string",
						"description": "Target Web URL",
					},
					"selector": map[string]interface{}{
						"type":        "string",
						"description": "CSS selector for the input element",
					},
					"text": map[string]interface{}{
						"type":        "string",
						"description": "Text string to type into the field",
					},
				},
				"required": []string{"url", "selector", "text"},
			},
		},
		{
			Name:        "browser_fill_form",
			Description: "Fill out an input form element with a value.",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"url": map[string]interface{}{
						"type":        "string",
						"description": "Target Web URL",
					},
					"selector": map[string]interface{}{
						"type":        "string",
						"description": "CSS selector for form input",
					},
					"value": map[string]interface{}{
						"type":        "string",
						"description": "Value to set in the input field",
					},
				},
				"required": []string{"url", "selector", "value"},
			},
		},
		{
			Name:        "browser_select_option",
			Description: "Select an option in a <select> element.",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"url": map[string]interface{}{
						"type":        "string",
						"description": "Target Web URL",
					},
					"selector": map[string]interface{}{
						"type":        "string",
						"description": "CSS selector for <select> element",
					},
					"value": map[string]interface{}{
						"type":        "string",
						"description": "Option value or text to select",
					},
				},
				"required": []string{"url", "selector", "value"},
			},
		},
		{
			Name:        "browser_press_key",
			Description: "Send a key press event (e.g. Enter, Tab, Escape, ArrowDown) to an element or page.",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"url": map[string]interface{}{
						"type":        "string",
						"description": "Target Web URL",
					},
					"key": map[string]interface{}{
						"type":        "string",
						"description": "Key name to press (Enter, Tab, Escape, etc.)",
					},
					"selector": map[string]interface{}{
						"type":        "string",
						"description": "Optional CSS selector to target before pressing key",
					},
				},
				"required": []string{"url", "key"},
			},
		},
		{
			Name:        "browser_hover",
			Description: "Hover mouse over an element matching the CSS selector.",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"url": map[string]interface{}{
						"type":        "string",
						"description": "Target Web URL",
					},
					"selector": map[string]interface{}{
						"type":        "string",
						"description": "CSS selector to hover over",
					},
				},
				"required": []string{"url", "selector"},
			},
		},
		{
			Name:        "browser_snapshot",
			Description: "Get the HTML DOM structure / interactive accessibility tree of the page.",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"url": map[string]interface{}{
						"type":        "string",
						"description": "Target Web URL",
					},
					"selector": map[string]interface{}{
						"type":        "string",
						"description": "Optional sub-tree CSS selector",
					},
				},
				"required": []string{"url"},
			},
		},
		{
			Name:        "browser_evaluate",
			Description: "Evaluate a custom JavaScript expression in the web page context and return the result.",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"url": map[string]interface{}{
						"type":        "string",
						"description": "Target Web URL",
					},
					"expression": map[string]interface{}{
						"type":        "string",
						"description": "JavaScript code string to evaluate",
					},
				},
				"required": []string{"url", "expression"},
			},
		},
		{
			Name:        "browser_get_cookies",
			Description: "Extract authentication cookies from authentic browser session.",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"domain": map[string]interface{}{
						"type":        "string",
						"description": "Domain or URL to fetch cookies for",
					},
				},
				"required": []string{"domain"},
			},
		},
		{
			Name:        "browser_take_screenshot",
			Description: "Take a screenshot of a target URL and return it as a native MCP image node (image/png) for low-token Vision AI processing.",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"url": map[string]interface{}{
						"type":        "string",
						"description": "Target Web URL to capture screenshot",
					},
				},
				"required": []string{"url"},
			},
		},
	}
}

func handleCallTool(params CallToolParams) (interface{}, error) {
	strArg := func(k string) string {
		if v, ok := params.Arguments[k].(string); ok {
			return v
		}
		return ""
	}

	makeRes := func(data string) (interface{}, error) {
		return map[string]interface{}{
			"content": []map[string]interface{}{
				{
					"type": "text",
					"text": data,
				},
			},
		}, nil
	}

	switch params.Name {
	case "browser_navigate":
		targetURL := strArg("url")
		if targetURL == "" {
			return nil, fmt.Errorf("missing 'url' argument")
		}
		resMsg, err := dispatchJobToBrowser("OPEN_AND_AUTOMATE", targetURL)
		if err != nil {
			return nil, err
		}
		return makeRes(resMsg.Data)

	case "browser_navigate_back":
		resMsg, err := dispatchJobToBrowser("NAVIGATE_BACK", "")
		if err != nil {
			return nil, err
		}
		return makeRes(resMsg.Data)

	case "browser_click":
		url := strArg("url")
		selector := strArg("selector")
		if url == "" || selector == "" {
			return nil, fmt.Errorf("missing 'url' or 'selector' argument")
		}
		resMsg, err := dispatchJobToBrowser("CLICK_ELEMENT", url, map[string]string{"selector": selector})
		if err != nil {
			return nil, err
		}
		return makeRes(resMsg.Data)

	case "browser_type":
		url := strArg("url")
		selector := strArg("selector")
		text := strArg("text")
		if url == "" || selector == "" {
			return nil, fmt.Errorf("missing 'url' or 'selector' argument")
		}
		resMsg, err := dispatchJobToBrowser("TYPE_TEXT", url, map[string]string{"selector": selector, "text": text})
		if err != nil {
			return nil, err
		}
		return makeRes(resMsg.Data)

	case "browser_fill_form":
		url := strArg("url")
		selector := strArg("selector")
		value := strArg("value")
		if url == "" || selector == "" {
			return nil, fmt.Errorf("missing 'url' or 'selector' argument")
		}
		resMsg, err := dispatchJobToBrowser("FILL_FORM", url, map[string]string{"selector": selector, "value": value})
		if err != nil {
			return nil, err
		}
		return makeRes(resMsg.Data)

	case "browser_select_option":
		url := strArg("url")
		selector := strArg("selector")
		value := strArg("value")
		if url == "" || selector == "" {
			return nil, fmt.Errorf("missing 'url' or 'selector' argument")
		}
		resMsg, err := dispatchJobToBrowser("SELECT_OPTION", url, map[string]string{"selector": selector, "value": value})
		if err != nil {
			return nil, err
		}
		return makeRes(resMsg.Data)

	case "browser_press_key":
		url := strArg("url")
		key := strArg("key")
		selector := strArg("selector")
		if url == "" || key == "" {
			return nil, fmt.Errorf("missing 'url' or 'key' argument")
		}
		resMsg, err := dispatchJobToBrowser("PRESS_KEY", url, map[string]string{"key": key, "selector": selector})
		if err != nil {
			return nil, err
		}
		return makeRes(resMsg.Data)

	case "browser_hover":
		url := strArg("url")
		selector := strArg("selector")
		if url == "" || selector == "" {
			return nil, fmt.Errorf("missing 'url' or 'selector' argument")
		}
		resMsg, err := dispatchJobToBrowser("HOVER_ELEMENT", url, map[string]string{"selector": selector})
		if err != nil {
			return nil, err
		}
		return makeRes(resMsg.Data)

	case "browser_snapshot":
		url := strArg("url")
		selector := strArg("selector")
		if url == "" {
			return nil, fmt.Errorf("missing 'url' argument")
		}
		resMsg, err := dispatchJobToBrowser("GET_SNAPSHOT", url, map[string]string{"selector": selector})
		if err != nil {
			return nil, err
		}
		return makeRes(resMsg.Data)

	case "browser_evaluate":
		url := strArg("url")
		expr := strArg("expression")
		if url == "" || expr == "" {
			return nil, fmt.Errorf("missing 'url' or 'expression' argument")
		}
		resMsg, err := dispatchJobToBrowser("EVALUATE_JS", url, map[string]string{"expression": expr})
		if err != nil {
			return nil, err
		}
		return makeRes(resMsg.Data)

	case "browser_get_cookies":
		domain := strArg("domain")
		if domain == "" {
			return nil, fmt.Errorf("missing 'domain' argument")
		}
		resMsg, err := dispatchJobToBrowser("GET_COOKIES", domain)
		if err != nil {
			return nil, err
		}
		return makeRes(resMsg.Data)

	case "browser_take_screenshot":
		targetURL := strArg("url")
		if targetURL == "" {
			return nil, fmt.Errorf("missing 'url' argument")
		}
		resMsg, err := dispatchJobToBrowser("TAKE_SCREENSHOT", targetURL)
		if err != nil {
			return nil, err
		}
		return makeRes(resMsg.Data)

	default:
		return nil, fmt.Errorf("unknown tool: %s", params.Name)
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
					"name":    "cosmos-embedded-mcp",
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
				"tools": getToolsList(),
			},
		})
		return res

	case "tools/call":
		var params CallToolParams
		if err := json.Unmarshal(req.Params, &params); err != nil {
			res, _ := json.Marshal(JSONRPCResponse{
				JSONRPC: "2.0",
				ID:      req.ID,
				Error: map[string]interface{}{
					"code":    -32602,
					"message": "Invalid params",
				},
			})
			return res
		}

		toolRes, err := handleCallTool(params)
		if err != nil {
			res, _ := json.Marshal(JSONRPCResponse{
				JSONRPC: "2.0",
				ID:      req.ID,
				Error: map[string]interface{}{
					"code":    -32000,
					"message": err.Error(),
				},
			})
			return res
		}

		res, _ := json.Marshal(JSONRPCResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Result:  toolRes,
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

// readMessage reads 4-byte little-endian header indicating payload length
func readMessage(r io.Reader) ([]byte, error) {
	var length uint32
	err := binary.Read(r, binary.LittleEndian, &length)
	if err != nil {
		return nil, err
	}
	buf := make([]byte, length)
	_, err = io.ReadFull(r, buf)
	if err != nil {
		return nil, err
	}
	return buf, nil
}

// writeMessage writes 4-byte little-endian header followed by payload
func writeMessage(w io.Writer, msg []byte) error {
	writeMu.Lock()
	defer writeMu.Unlock()
	length := uint32(len(msg))
	err := binary.Write(w, binary.LittleEndian, length)
	if err != nil {
		return err
	}
	_, err = w.Write(msg)
	return err
}

func sendSystemLog(level, format string, args ...interface{}) {
	text := fmt.Sprintf(format, args...)
	msg := map[string]string{
		"type":    "LOG",
		"level":   level,
		"message": text,
	}
	bytes, _ := json.Marshal(msg)
	_ = writeMessage(os.Stdout, bytes)
}

func startHeartbeat() {
	ticker := time.NewTicker(20 * time.Second)
	defer ticker.Stop()
	heartbeatMsg := []byte(`{"type":"HEARTBEAT_KEEP_ALIVE"}`)
	for range ticker.C {
		_ = writeMessage(os.Stdout, heartbeatMsg)
	}
}

func startFilePolling() {
	jobPath := filepath.Join(os.TempDir(), "browser_job.json")
	for {
		time.Sleep(1 * time.Second)
		if _, err := os.Stat(jobPath); os.IsNotExist(err) {
			continue
		}
		data, err := os.ReadFile(jobPath)
		if err != nil {
			continue
		}
		_ = os.Remove(jobPath)
		var job Job
		if err := json.Unmarshal(data, &job); err != nil {
			continue
		}
		tokenLock.RLock()
		currentValidToken := validToken
		tokenLock.RUnlock()
		if job.Token != currentValidToken {
			continue
		}
		jobPayload := map[string]string{
			"type":   "JOB_REQUEST",
			"action": job.Action,
			"url":    job.URL,
		}
		payloadBytes, _ := json.Marshal(jobPayload)
		_ = writeMessage(os.Stdout, payloadBytes)
	}
}

func startVproxyPolling() {
	syncPath := filepath.Join(os.TempDir(), "vproxy_sync.json")
	for {
		time.Sleep(1 * time.Second)
		if _, err := os.Stat(syncPath); os.IsNotExist(err) {
			continue
		}
		data, err := os.ReadFile(syncPath)
		if err != nil {
			continue
		}
		_ = os.Remove(syncPath)
		var syncFile VproxySyncFile
		if err := json.Unmarshal(data, &syncFile); err != nil {
			continue
		}
		dispatchVproxySync(syncFile)
	}
}

func triggerVproxyScan() {
	syncPath := filepath.Join(os.TempDir(), "vproxy_sync.json")
	if _, err := os.Stat(syncPath); err == nil {
		data, err := os.ReadFile(syncPath)
		if err == nil {
			var syncFile VproxySyncFile
			if json.Unmarshal(data, &syncFile) == nil {
				dispatchVproxySync(syncFile)
				return
			}
		}
	}
}

func dispatchVproxySync(syncFile VproxySyncFile) {
	syncPayload := map[string]interface{}{
		"type":         "VPROXY_SYNC",
		"profiles":     syncFile.Profiles,
		"autoSelectId": syncFile.AutoSelectID,
	}
	payloadBytes, err := json.Marshal(syncPayload)
	if err == nil {
		_ = writeMessage(os.Stdout, payloadBytes)
	}
}

func writeJobResponse(msg ChromeMessage) {
	resPath := filepath.Join(os.TempDir(), "browser_response.json")
	data, err := json.MarshalIndent(msg, "", "  ")
	if err == nil {
		_ = os.WriteFile(resPath, data, 0666)
	}
}
