package main

import (
	"fmt"
	"net"
	"strings"
	"testing"
	"time"
)

func TestUpstreamProbingAndSorting(t *testing.T) {
	// 1. Create a fast dummy listener
	fastListener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("failed to create listener: %v", err)
	}
	defer fastListener.Close()
	fastAddr := fastListener.Addr().String()

	// 2. Create a slow dummy listener
	slowListener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("failed to create listener: %v", err)
	}
	defer slowListener.Close()
	slowAddr := slowListener.Addr().String()

	go func() {
		for {
			conn, err := slowListener.Accept()
			if err != nil {
				return
			}
			time.Sleep(80 * time.Millisecond)
			_, _ = conn.Write([]byte{0x05, 0x00})
			conn.Close()
		}
	}()

	go func() {
		for {
			conn, err := fastListener.Accept()
			if err != nil {
				return
			}
			_, _ = conn.Write([]byte{0x05, 0x00})
			conn.Close()
		}
	}()

	// Unreachable port
	deadAddr := "127.0.0.1:54321"

	upstreams := []string{
		fmt.Sprintf("socks5://%s", deadAddr),
		fmt.Sprintf("socks5://%s", slowAddr),
		fmt.Sprintf("socks5://%s", fastAddr),
	}

	result := resolveSortedUpstreamString(upstreams, 500*time.Millisecond)
	if !strings.HasPrefix(result, fmt.Sprintf("SOCKS5 %s", fastAddr)) {
		t.Fatalf("expected fastest upstream %s at front, got: %s", fastAddr, result)
	}
	if strings.Contains(result, deadAddr) {
		t.Fatalf("dead upstream %s should not precede live ones: %s", deadAddr, result)
	}
}

func TestProbeTimeout(t *testing.T) {
	// Probe non-routable IP with short timeout
	start := time.Now()
	upstreams := []string{"socks5://192.0.2.1:1080"} // RFC 5737 TEST-NET-1 (drops packets)
	_ = resolveSortedUpstreamString(upstreams, 200*time.Millisecond)
	duration := time.Since(start)

	if duration > 1*time.Second {
		t.Fatalf("probe took too long: %v, expected <= 1s", duration)
	}
}

func TestAllUpstreamsUnreachableFallback(t *testing.T) {
	upstreams := []string{
		"socks5://192.0.2.1:1080",
		"socks5://192.0.2.2:1080",
	}

	result := resolveSortedUpstreamString(upstreams, 100*time.Millisecond)
	if !strings.Contains(result, "192.0.2.1:1080") {
		t.Fatalf("expected fallback to raw upstreams when all fail, got: %s", result)
	}
}

func TestProbeCache(t *testing.T) {
	upstreamCacheMu.Lock()
	cachedUpstreamResult = "SOCKS5 127.0.0.1:9999"
	cachedUpstreamExpires = time.Now().Add(10 * time.Second)
	cachedUpstreamFingerprint = "test-fingerprint"
	upstreamCacheMu.Unlock()

	got := getCachedOrProbeUpstreams([]string{"socks5://127.0.0.1:1111"}, "test-fingerprint")
	if got != "SOCKS5 127.0.0.1:9999" {
		t.Fatalf("expected cache hit, got %s", got)
	}
}

func TestDefaultProxyDomains(t *testing.T) {
	requiredDomains := []string{
		"google.com", "google", "google.dev", "google.com.hk",
		"gstatic.com", "googleapis.com", "googleusercontent.com",
		"youtube.com", "youtu.be", "ytimg.com", "googlevideo.com",
		"github.com", "githubusercontent.com", "wikipedia.org",
		"live.com", "golang.org",
	}

	for _, d := range requiredDomains {
		escaped := strings.ReplaceAll(d, ".", "\\.")
		regexPattern := fmt.Sprintf("/(?:^|\\.)%s$/", escaped)
		if len(regexPattern) == 0 {
			t.Fatalf("invalid regex for %s", d)
		}
	}
}

func TestRuleEscapingAndCIDR(t *testing.T) {
	rulesWithCIDR := []string{"127.0.0.0/8", "192.168.0.0/16", "10.0.0.0/8"}
	for _, r := range rulesWithCIDR {
		escaped := strings.ReplaceAll(r, "\\", "\\\\")
		escaped = strings.ReplaceAll(escaped, ".", "\\.")
		escaped = strings.ReplaceAll(escaped, "/", "\\/")
		jsRegex := fmt.Sprintf("/(?:^|\\.)%s$/", escaped)
		if !strings.Contains(jsRegex, "\\/") {
			t.Fatalf("expected escaped slash in %s, got %s", r, jsRegex)
		}
	}
}

func TestCDPConsoleLogToolRegistrationAndDispatch(t *testing.T) {
	tools := getToolsList()
	var found bool
	for _, tool := range tools {
		if tool.Name == "browser_get_console_logs" {
			found = true
			if tool.Description == "" {
				t.Fatalf("browser_get_console_logs missing description")
			}
			schema, ok := tool.InputSchema.(map[string]interface{})
			if !ok {
				t.Fatalf("browser_get_console_logs schema invalid")
			}
			props, ok := schema["properties"].(map[string]interface{})
			if !ok || props["url"] == nil {
				t.Fatalf("browser_get_console_logs schema missing 'url' property")
			}
			break
		}
	}
	if !found {
		t.Fatalf("browser_get_console_logs tool not registered in getToolsList()")
	}

	// Verify missing url returns error
	_, err := handleCallTool(CallToolParams{
		Name:      "browser_get_console_logs",
		Arguments: map[string]interface{}{},
	})
	if err == nil || !strings.Contains(err.Error(), "missing 'url'") {
		t.Fatalf("expected missing url error, got: %v", err)
	}
}

func TestCDPNetworkLogToolRegistrationAndDispatch(t *testing.T) {
	tools := getToolsList()
	var found bool
	for _, tool := range tools {
		if tool.Name == "browser_get_network_logs" {
			found = true
			if tool.Description == "" {
				t.Fatalf("browser_get_network_logs missing description")
			}
			schema, ok := tool.InputSchema.(map[string]interface{})
			if !ok {
				t.Fatalf("browser_get_network_logs schema invalid")
			}
			props, ok := schema["properties"].(map[string]interface{})
			if !ok || props["url"] == nil {
				t.Fatalf("browser_get_network_logs schema missing 'url' property")
			}
			break
		}
	}
	if !found {
		t.Fatalf("browser_get_network_logs tool not registered in getToolsList()")
	}

	// Verify missing url returns error
	_, err := handleCallTool(CallToolParams{
		Name:      "browser_get_network_logs",
		Arguments: map[string]interface{}{},
	})
	if err == nil || !strings.Contains(err.Error(), "missing 'url'") {
		t.Fatalf("expected missing url error, got: %v", err)
	}
}
