# Privacy Policy for Domour Copilot

> Last updated: July 28, 2026

Domour Copilot ("we", "our", or "extension") is committed to protecting your privacy. This Privacy Policy explains our practices regarding user data for the Domour Copilot browser extension.

## 1. Overview & Data Ownership

Domour Copilot is an extension-first local browser automation bridge and dynamic proxy manager. **All data processing and browser automation occur strictly on your local machine.** 

- We **do not** operate remote analytics, user tracking, or telemetry servers.
- We **do not** collect, store, or sell any personally identifiable information (PII).

## 2. Local Data Processing & Storage

The extension uses Chrome's `chrome.storage.local` API exclusively to save your preferences on your own device:
- **Proxy Profiles**: Local proxy configurations, SOCKS5 servers, and PAC URL rules.
- **Privacy Toggles**: Your choice regarding sensitive cookie extraction permissions.
- **API Access Tokens**: Locally generated authorization tokens for your local AI agent.

No stored preferences leave your browser environment.

## 3. Sensitive Permissions & User Control

- **`cookies` & `scripting`**: Used solely to extract web text or session cookies when triggered locally by your own authorized AI agent. Cookie extraction is disabled by default and requires explicit activation via the extension UI toggle.
- **`proxy`**: Used to apply dynamic PAC proxy routing rules and local LAN bypass directly to your Chromium browser settings.

## 4. Third-Party Services

Domour Copilot does **not** integrate third-party advertising, analytics, or tracking services.

## 5. Contact Information

If you have any questions or concerns regarding this Privacy Policy, please contact us via GitHub Issues:
https://github.com/qtopie/domour-chrome-extension/issues
