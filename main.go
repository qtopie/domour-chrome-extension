package main

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
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

// Job defines the format of the job payload received in the temp directory
type Job struct {
	Token  string `json:"token"`
	Action string `json:"action"`
	URL    string `json:"url"`
}

// VproxyProfilePayload defines proxy profile format from vproxy config
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

// VproxySyncFile defines the payload written to vproxy_sync.json
type VproxySyncFile struct {
	Token        string                 `json:"token,omitempty"`
	Profiles     []VproxyProfilePayload `json:"profiles"`
	AutoSelectID string                 `json:"autoSelectId,omitempty"`
}

var (
	validToken string
	tokenLock  sync.RWMutex
	writeMu    sync.Mutex
	logFile    *os.File
)

func main() {
	// Set up logging to a file in the project folder to avoid polluting stdout
	var err error
	logFile, err = os.OpenFile("bridge.log", os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
	if err != nil {
		// Failback to stderr since Chrome captures it anyway
		log.SetOutput(os.Stderr)
	} else {
		defer logFile.Close()
		log.SetOutput(logFile)
	}

	log.Println("Bridge started. Waiting for INITIAL_AUTH on Stdin...")

	// 1. Initial Authentication Phase (Zero-Trust Blocked State)
	// We strictly process stdin until we get a valid INITIAL_AUTH message containing the token.
	for {
		msgBytes, err := readMessage(os.Stdin)
		if err != nil {
			log.Fatalf("Error reading initial auth message: %v", err)
		}

		var msg ChromeMessage
		if err := json.Unmarshal(msgBytes, &msg); err != nil {
			log.Printf("Failed to parse initial auth message: %v. Raw: %s", err, string(msgBytes))
			continue
		}

		if msg.Type == "INITIAL_AUTH" {
			if msg.Token == "" {
				log.Println("Received INITIAL_AUTH with empty token. Refusing authorization.")
				continue
			}
			tokenLock.Lock()
			validToken = msg.Token
			tokenLock.Unlock()
			log.Printf("Successfully authenticated. Token locked: %s", msg.Token)
			
			// Send a log feedback packet to Chrome confirming success
			sendSystemLog("info", "Bridge authenticated and token locked.")
			break
		} else {
			log.Printf("Received non-auth message %q before authentication. Ignored.", msg.Type)
		}
	}

	// 2. Start Keep-Alive Heartbeat (every 20 seconds) to prevent MV3 shutdown
	go startHeartbeat()

	// 3. Start Polling for browser_job.json & vproxy_sync.json
	go startFilePolling()
	go startVproxyPolling()

	// 4. Main Event Loop: Read and handle standard messages from Chrome background service worker
	for {
		msgBytes, err := readMessage(os.Stdin)
		if err != nil {
			if err == io.EOF {
				log.Println("Edge closed connection. Exiting bridge.")
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

		log.Printf("Received message from Edge: Type=%s, Status=%s", msg.Type, msg.Status)

		if msg.Type == "JOB_RESPONSE" {
			log.Printf("Job response received. URL=%s, Status=%s, Data length=%d", msg.URL, msg.Status, len(msg.Data))
			writeJobResponse(msg)
		} else if msg.Type == "TRIGGER_VPROXY_SYNC" {
			log.Println("Manual VPROXY sync triggered from React UI.")
			sendSystemLog("system", "VProxy manual sync requested from Side Panel.")
			triggerVproxyScan()
		}
	}
}

// readMessage reads a 4-byte little-endian header indicating payload length, then the payload itself.
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

// writeMessage writes a 4-byte little-endian header followed by the payload to stdout.
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

// sendSystemLog sends a log entry back to the Chrome extension to display in the UI log view
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

// startHeartbeat executes every 20 seconds pushing HEARTBEAT_KEEP_ALIVE packets to Chrome
func startHeartbeat() {
	ticker := time.NewTicker(20 * time.Second)
	defer ticker.Stop()

	heartbeatMsg := []byte(`{"type":"HEARTBEAT_KEEP_ALIVE"}`)

	for range ticker.C {
		log.Println("Sending HEARTBEAT_KEEP_ALIVE...")
		err := writeMessage(os.Stdout, heartbeatMsg)
		if err != nil {
			log.Printf("Error sending heartbeat: %v", err)
		}
	}
}

// startFilePolling continuously polls for browser_job.json in the system temporary directory
func startFilePolling() {
	jobPath := filepath.Join(os.TempDir(), "browser_job.json")
	log.Printf("Starting job file polling at: %s", jobPath)

	for {
		time.Sleep(1 * time.Second)

		// Check if file exists
		if _, err := os.Stat(jobPath); os.IsNotExist(err) {
			continue
		}

		log.Println("Found browser_job.json. Processing...")

		// Read and burn immediately
		data, err := os.ReadFile(jobPath)
		if err != nil {
			log.Printf("Failed to read job file: %v", err)
			continue
		}

		// Delete the file immediately to avoid re-triggering or multiple reads
		if err := os.Remove(jobPath); err != nil {
			log.Printf("Failed to remove job file: %v", err)
		} else {
			log.Println("Successfully read and burned browser_job.json")
		}

		var job Job
		if err := json.Unmarshal(data, &job); err != nil {
			log.Printf("Failed to unmarshal job JSON: %v", err)
			sendSystemLog("error", "Failed to parse job JSON: %v", err)
			continue
		}

		// Validate token in memory
		tokenLock.RLock()
		currentValidToken := validToken
		tokenLock.RUnlock()

		if job.Token != currentValidToken {
			log.Printf("Authorization failed: provided token %q does not match locked token %q", job.Token, currentValidToken)
			sendSystemLog("error", "Unauthorized access attempt: invalid token provided in browser_job.json")
			continue
		}

		// Process the action
		log.Printf("Processing authorized job: Action=%s, URL=%s", job.Action, job.URL)
		sendSystemLog("info", "Received authorized job. Action: %s, URL: %s", job.Action, job.URL)

		// Send job to Chrome background worker
		jobPayload := map[string]string{
			"type":   "JOB_REQUEST",
			"action": job.Action,
			"url":    job.URL,
		}
		payloadBytes, err := json.Marshal(jobPayload)
		if err != nil {
			log.Printf("Failed to marshal job request: %v", err)
			continue
		}

		err = writeMessage(os.Stdout, payloadBytes)
		if err != nil {
			log.Printf("Failed to send job request to Edge: %v", err)
			sendSystemLog("error", "Failed to send job request to browser: %v", err)
		}
	}
}

// startVproxyPolling continuously polls for vproxy_sync.json in temp directory
func startVproxyPolling() {
	syncPath := filepath.Join(os.TempDir(), "vproxy_sync.json")
	log.Printf("Starting vproxy sync file polling at: %s", syncPath)

	for {
		time.Sleep(1 * time.Second)

		if _, err := os.Stat(syncPath); os.IsNotExist(err) {
			continue
		}

		log.Println("Found vproxy_sync.json. Processing vproxy sync...")

		data, err := os.ReadFile(syncPath)
		if err != nil {
			log.Printf("Failed to read vproxy sync file: %v", err)
			continue
		}

		if err := os.Remove(syncPath); err != nil {
			log.Printf("Failed to remove vproxy sync file: %v", err)
		}

		var syncFile VproxySyncFile
		if err := json.Unmarshal(data, &syncFile); err != nil {
			log.Printf("Failed to unmarshal vproxy_sync.json: %v", err)
			sendSystemLog("error", "Failed to parse vproxy_sync.json: %v", err)
			continue
		}

		if syncFile.Token != "" {
			tokenLock.RLock()
			currentValidToken := validToken
			tokenLock.RUnlock()

			if syncFile.Token != currentValidToken {
				log.Printf("Vproxy sync auth failed: provided token %q invalid", syncFile.Token)
				sendSystemLog("error", "Unauthorized vproxy sync attempt")
				continue
			}
		}

		dispatchVproxySync(syncFile)
	}
}

// triggerVproxyScan scans for local vproxy config files or sends default sync if present
func triggerVproxyScan() {
	// Check if vproxy_sync.json exists or generate default/sample vproxy profile
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
	sendSystemLog("system", "VProxy scan completed. No active vproxy_sync.json pending.")
}

func dispatchVproxySync(syncFile VproxySyncFile) {
	log.Printf("Synced %d proxy profiles from vproxy config", len(syncFile.Profiles))
	sendSystemLog("system", "Successfully synced %d proxy profiles from vproxy", len(syncFile.Profiles))

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

// writeJobResponse writes the result payload back to browser_response.json in temp directory
func writeJobResponse(msg ChromeMessage) {
	resPath := filepath.Join(os.TempDir(), "browser_response.json")
	data, err := json.MarshalIndent(msg, "", "  ")
	if err != nil {
		log.Printf("Failed to marshal job response: %v", err)
		return
	}
	err = os.WriteFile(resPath, data, 0666)
	if err != nil {
		log.Printf("Failed to write response file: %v", err)
	} else {
		log.Printf("Wrote job response to %s", resPath)
	}
}
