# AI Browser Automation Platform (Domour Copilot Bridge)

A secure, extension-first browser automation platform using a **React (Vite + TS)** side panel UI and a **Go** native messaging bridge daemon. It operates entirely within standard browser extension security boundaries (no CDP/debugging ports required) and routes automation jobs securely using a zero-trust token verification model.

---

## 🏗️ Architecture Blueprint

The platform functions across three distinct components:
1. **Frontend UI (Microsoft Edge Side Panel)**: Built using React (Vite + TypeScript). It manages the API token, shows native bridge connection status, and displays live scrolling execution logs.
2. **Background Service Worker (`background.js`)**: An MV3 service worker that establishes a native port to Go, executes automation scripting, intercepts heartbeats to defeat Microsoft Edge's 30-second worker idle shutdown, and pipes logs.
3. **Local Bridge Engine (`main.go`)**: A native Go binary that interacts via standard I/O (using 4-byte little-endian length prefixes). It listens in a blocked state for `INITIAL_AUTH`, polls the system temp directory for jobs (`browser_job.json`), performs zero-trust token matching, and pushes heartbeats.

---

## 📂 File Layout

```text
.
├── bin/
│   ├── bridge                  # Compiled Go native bridge daemon (NM Host)
│   └── bridge-cli              # Compiled CLI tool for dropping authorized jobs
├── cmd/
│   └── main.go                 # CLI tool entry point (formerly send_cmd.go)
├── frontend/                   # Vite + React + TS Side Panel Frontend
│   ├── dist/                   # Compiled production artifact (Unpacked Extension)
│   ├── public/
│   │   ├── background.js       # Extension Service Worker
│   │   └── manifest.json       # Manifest V3 configuration
│   ├── src/
│   │   ├── App.tsx             # Gorgeous panel UI with Token Copy & Log Console
│   │   ├── index.css           # Custom Vanilla CSS premium design tokens
│   │   └── main.tsx
│   └── vite.config.ts          # Compilation configurations (hashing disabled)
├── main.go                     # Core Go Bridge Daemon source
├── register_host.sh            # Helper script to register NM Host on Linux
└── README.md                   # This instruction file
```

---

## ⚡ Setup & Installation

Follow these steps to build, register, and run the platform:

### 1. Compile the Go Core
Run the compilation command in the root directory to generate both the bridge daemon and the CLI tool:
```bash
# Cleans dependencies
go mod tidy

# Builds binaries
go build -o bin/bridge main.go
go build -o bin/bridge-cli cmd/main.go
```

### 2. Build the React Side Panel
Compile the React frontend codebase:
```bash
cd frontend
npm install
npm run dev # To check dev server (optional)
npm run build
cd ..
```
The compiled, ready-to-load Edge Extension folder is generated in `frontend/dist/`.

### 3. Load the Extension in Microsoft Edge
1. Open Microsoft Edge and navigate to `edge://extensions/`.
2. Enable **Developer mode** using the toggle in the bottom-left corner.
3. Click the **Load unpacked** button.
4. Select the `frontend/dist` directory from this project workspace.
5. Once loaded, copy the generated **Extension ID** (a 32-character string, e.g., `abcdefghijklmnopqrstuvwxyzabcdef`).

### 4. Register the Native Messaging Host
To allow Microsoft Edge to communicate with your compiled Go binary, run the register script with your Extension ID:
```bash
./register_host.sh <YOUR_EXTENSION_ID>
```
On Linux, this writes a user-specific manifest under `~/.config/microsoft-edge/NativeMessagingHosts/com.go_react.search_bridge.json`.

### 5. Launch Microsoft Edge with Extension (Automated Testing)
You can launch an isolated instance of Microsoft Edge with the compiled unpacked extension already preloaded by running:
```bash
task edge:launch
```
This launches a separate session using a local profile `.edge-profile` so that it does not read or affect your daily browser profile.

---

## 🛠️ Operating & Testing the Platform

### Step 1: Open the Side Panel
1. In Microsoft Edge, click the **Extensions** icon (puzzle piece) in the toolbar.
2. Select **AI Browser Automation Platform** to open the side panel.
3. On first launch, the extension generates a secure token (e.g. `tk_a6c9d7...`).
4. Once the side panel is visible, check the status at the top. It should display **ACTIVE**, confirming a successful connection to the Go daemon.

### Step 2: Trigger Automation via CLI
Use the compiled `bridge-cli` tool to send an automation command to the bridge. 

Copy your token from the Side Panel UI and run:
```bash
./bin/bridge-cli <YOUR_TOKEN> <TARGET_URL>
```
*Example:*
```bash
./bin/bridge-cli tk_a61cf2de984e72390f7d4576b9101d https://example.com
```

#### What happens under the hood:
1. The CLI tool writes the job payload to `os.TempDir()/browser_job.json`.
2. The Go daemon polls the folder, reads the job, and immediately deletes ("burns") the file.
3. The daemon verifies the job's `token` against its locked memory token.
4. If authorized, Go routes the job to the Edge extension using 4-byte standard NM I/O framing.
5. The extension's service worker opens the URL in the background, waits for `'complete'`, runs a scripting injection to extract the page properties, and responds back.
6. The Go daemon writes the scraping response details to `os.TempDir()/browser_response.json`.
7. Execution events are displayed live in the Side Panel log view!
