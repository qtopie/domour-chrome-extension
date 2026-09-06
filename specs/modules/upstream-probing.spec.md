# Module Spec: Upstream Probing & Latency-Sorted PAC Generation

- **Module Name:** `upstream-probing`
- **Scope:** Local Native Bridge (`main.go`) PAC Server & Dynamic Proxy Configuration
- **Status:** APPROVED

---

## 1. Background & Problem Statement

When `main.go` serves `/proxy.pac`, it reads `cfg.Upstreams` from `~/.vproxy/config.json`. Previously, it blindly concatenated all upstreams in static order into the PAC script. If the first upstream in the list is unreachable (e.g. offline machine, no route to host), Chromium will attempt to connect to the dead upstream and hang for up to 30 seconds before timing out, resulting in broken connectivity and perception of proxy failure.

This module introduces concurrent active probing (health check) with latency measurement for all configured upstreams, caching probe results, and sorting live nodes so that the lowest-latency upstream is placed first in the generated PAC proxy fallback chain. Dead or unreachable nodes are moved to the end or excluded, ensuring immediate successful connection in Chrome.

---

## 2. Architecture & Invariants

1. **Concurrent Probing:** Every configured upstream URL (e.g. `socks5://host:port`, `http://host:port`) is probed concurrently via TCP connection / handshake with a strict timeout (e.g. 1000ms).
2. **Latency-based Sorting:** Upstreams that succeed with the lowest round-trip time (RTT) are sorted in ascending order (`best -> second best -> ...`).
3. **Graceful Fallback:** If all probes fail or time out, fall back to the original configured upstream order with the default fallback list, avoiding empty PAC proxy declarations.
4. **Caching & Debouncing:** Probe results are cached with a configurable TTL (e.g. 15-30s). When a `/proxy.pac` request arrives, cached probe results are used if valid, or a fresh probe is triggered if expired or forced.
5. **Intranet/LAN Bypass Integrity:** Generated PAC script continues to guarantee that loopback and private LAN addresses resolve to `DIRECT`.

---

## 3. BDD Scenarios

### SPEC-UP-001: Probe Multiple Upstreams and Order by Latency
- **Given** `cfg.Upstreams` contains `["socks5://192.168.50.188:1080", "socks5://192.168.50.31:1080"]`
- **When** `192.168.50.188:1080` is unreachable (timeout/no route) and `192.168.50.31:1080` responds in 15ms
- **Then** The generated PAC script places `SOCKS5 192.168.50.31:1080; SOCKS 192.168.50.31:1080` before the unreachable node in the proxy return list.

### SPEC-UP-002: Concurrent Probe Timeout Bounds
- **Given** An upstream node is blackholed or drops packets without sending TCP RST
- **When** The probe is executed
- **Then** The probe completes within the strict probe timeout (<= 1500ms) without blocking the PAC response indefinitely.

### SPEC-UP-003: Caching Probe Results
- **Given** A successful upstream probe was performed less than TTL (e.g. 15s) ago
- **When** A subsequent `/proxy.pac` request is handled
- **Then** The cached sorted upstream string is returned without triggering synchronous TCP probes.

### SPEC-UP-004: All Upstreams Unreachable Fallback
- **Given** All configured upstreams fail health check probes
- **When** `/proxy.pac` is requested
- **Then** The server falls back to returning the configured upstreams in their raw declaration order rather than an empty proxy string.

### SPEC-UP-005: Built-in Default Proxy Domain List
- **Given** The user requests PAC generation or default proxy rules
- **When** Evaluating default proxied domains
- **Then** The PAC includes standard proxy domain patterns for Google ecosystem (`*.google.com`, `*.google`, `*.google.dev`, `*.google.com.hk`, `*.gstatic.com`, `*.googleapis.com`, `*.googleusercontent.com`, `*.youtube.com`, `*.youtu.be`, `*.ytimg.com`, `*.googlevideo.com`), developer services (`*.github.com`, `*.githubusercontent.com`, `*.golang.org`), and knowledge/productivity sites (`*.wikipedia.org`, `*.live.com`).
