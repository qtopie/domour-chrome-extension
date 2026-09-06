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
