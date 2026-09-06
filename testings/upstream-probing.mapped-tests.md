# Mapped Tests: Upstream Probing & Latency-Sorted PAC Generation

Mapping between `specs/modules/upstream-probing.spec.md` scenarios and implementation verification.

## Scenarios
- `SPEC-UP-001`: Probe Multiple Upstreams and Order by Latency
  - Test / Verification: `main_test.go::TestUpstreamProbingAndSorting` verifies that reachable upstreams with lower latency are sorted to the front and unreachable upstreams are deprioritized or omitted.
- `SPEC-UP-002`: Concurrent Probe Timeout Bounds
  - Test / Verification: `main_test.go::TestProbeTimeout` verifies that probes to blackholed addresses do not exceed the configured timeout bound.
- `SPEC-UP-003`: Caching Probe Results
  - Test / Verification: `main_test.go::TestProbeCache` verifies cached proxy strings avoid redundant dials within TTL.
- `SPEC-UP-004`: All Upstreams Unreachable Fallback
  - Test / Verification: `main_test.go::TestAllUpstreamsUnreachableFallback` verifies non-empty proxy list fallback when all probes fail.
- `SPEC-UP-005`: Built-in Default Proxy Domain List
  - Test / Verification: `main_test.go::TestDefaultProxyDomains` verifies that standard Google, GitHub, Wikipedia, Golang, etc. domains are incorporated into default proxied list.
