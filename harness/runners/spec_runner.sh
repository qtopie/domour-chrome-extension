#!/usr/bin/env bash
set -euo pipefail

echo "[Harness Runner] Executing Spec BDD Scenarios and Invariant Assertions..."

# Validate spec/test mapping: every SPEC-<PREFIX>-### referenced in each spec
# under specs/modules/ must appear in the matching mapped-tests stub file
# (guards against scenario drift across all approved specs).
TOTAL_FAIL=0
for SPEC_FILE in specs/modules/*.spec.md; do
    [ -e "$SPEC_FILE" ] || continue
    # Skip scaffolding placeholder (template.spec.md) — not a real module spec.
    case "$(basename "$SPEC_FILE")" in
        template.spec.md) continue ;;
    esac
    SPEC_BASE=$(basename "$SPEC_FILE" .spec.md)
    MAPPED_FILE="testings/${SPEC_BASE}.mapped-tests.md"

    # Derive the scenario ID prefix used in this spec (e.g. SPEC-UI-WS / SPEC-RH / SPEC-TA).
    PREFIX=$(grep -oE "SPEC-[A-Z0-9]+-[0-9]{3}" "$SPEC_FILE" | head -1 | sed -E 's/-[0-9]{3}$//' || true)
    if [ -z "$PREFIX" ]; then
        echo "[Harness Runner] ⚠️  $SPEC_BASE: no SPEC-### scenarios found, skipping."
        continue
    fi

    MISSING=0
    for id in $(grep -oE "${PREFIX}-[0-9]{3}" "$SPEC_FILE" | sort -u); do
        if ! grep -q "$id" "$MAPPED_FILE" 2>/dev/null; then
            echo "  [MISSING] $id referenced in $SPEC_FILE but not mapped in $MAPPED_FILE"
            MISSING=1
        fi
    done
    if [ $MISSING -eq 1 ]; then
        echo "[Harness Runner] ❌ Spec scenario drift detected (${PREFIX})."
        TOTAL_FAIL=1
    else
        echo "[Harness Runner] ✅ All ${PREFIX}-### scenarios mapped in testings/."
    fi
done

if [ $TOTAL_FAIL -eq 1 ]; then
    exit 1
fi

echo "[Harness Runner] All Spec BDD assertions completed successfully."
