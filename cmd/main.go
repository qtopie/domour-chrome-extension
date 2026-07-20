package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
)

type Job struct {
	Token  string `json:"token"`
	Action string `json:"action"`
	URL    string `json:"url"`
}

func main() {
	token := flag.String("token", "", "Security token (starts with tk_)")
	action := flag.String("action", "OPEN_AND_AUTOMATE", "Automation action to execute")
	url := flag.String("url", "", "Target URL for the browser")

	flag.Parse()

	// Fallback to positional arguments if flags are not provided: <token> <url> [<action>]
	if *token == "" || *url == "" {
		if flag.NArg() >= 2 {
			*token = flag.Arg(0)
			*url = flag.Arg(1)
			if flag.NArg() >= 3 {
				*action = flag.Arg(2)
			}
		} else {
			fmt.Println("Usage: bridge-cli -token <token> -url <url> [-action <action>]")
			fmt.Println("   Or: bridge-cli <token> <url> [<action>]")
			os.Exit(1)
		}
	}

	job := Job{
		Token:  *token,
		Action: *action,
		URL:    *url,
	}

	data, err := json.MarshalIndent(job, "", "  ")
	if err != nil {
		fmt.Printf("Error packaging job: %v\n", err)
		os.Exit(1)
	}

	jobPath := filepath.Join(os.TempDir(), "browser_job.json")
	err = os.WriteFile(jobPath, data, 0600)
	if err != nil {
		fmt.Printf("Error writing job to temp directory: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("Successfully wrote job to %s\n", jobPath)
}
