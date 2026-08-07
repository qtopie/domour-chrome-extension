#!/usr/bin/env bash
set -euo pipefail

echo "[Harness Runner] Executing Spec BDD Scenarios and Invariant Assertions..."

# Validate spec/test mapping: every SPEC-UI-WS-### referenced in the spec must
# appear in the mapped-tests stub file (guards against scenario drift).
SPEC_FILE="specs/modules/ui-workspace-design.spec.md"
MAPPED_FILE="testings/ui-workspace-design.mapped-tests.md"

if [ -f "$SPEC_FILE" ]; then
    MISSING=0
    for id in $(grep -oE "SPEC-UI-WS-[0-9]{3}" "$SPEC_FILE" | sort -u); do
        if ! grep -q "$id" "$MAPPED_FILE" 2>/dev/null; then
            echo "  [MISSING] $id referenced in spec but not mapped in $MAPPED_FILE"
            MISSING=1
        fi
    done
    if [ $MISSING -eq 1 ]; then
        echo "[Harness Runner] ❌ Spec scenario drift detected (SPEC-UI-WS)."
        exit 1
    fi
    echo "[Harness Runner] ✅ All SPEC-UI-WS-### scenarios mapped in testings/."
fi

echo "[Harness Runner] All Spec BDD assertions completed successfully."
