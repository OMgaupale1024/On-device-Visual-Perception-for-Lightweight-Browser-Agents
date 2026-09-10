# Phase 8 plan — fresh local visual outcome verification

Baseline: b9d7a92, main clean, fetch and pull --ff-only completed before edits.
Code/tests/Git inspected: worker owns the Phase 1–5 transaction inline, then calls
requestPlan and mints a Phase 7 ticket. OCR normalizes line confidence from 0–100 to
0–1 (invalid/missing becomes null), and regenerates visual_N per observation.
The demo changes its submitted view synchronously on Continue.

## Implementation plan (written before implementation)

1. Extract the existing local observation transaction into background/local-observation.js.
   Preserve capture checks, decoded dimensions, OCR, PII detection, Canvas redaction,
   safe visual filtering, final context approval and transient-reference cleanup.
   Analysis alone calls the planner and mints a ticket after this function returns.
2. After EXECUTED, automatically wait **750 ms**, then make **one** fresh observation.
   No retry or recovery action. Existing OCR deadline is 45 seconds; bound browser
   API waits to 5 seconds and the verification transaction to 60 seconds. On timeout
   cancel further processing; never accept a late result.
3. Require the intended tab to exist and be active in the expected current window,
   before and after capture. Observe its current document, never the action document.
   Preserve before/after consistency within the NEW capture transaction. Fresh UUID,
   capture timestamp, dimensions and OCR boxes/IDs are mandatory.
4. verification/verify-visual-result.js consumes only approved safe context visual
   elements with source=visual. Require a different observation captured after dispatch.
   Fixed local spec: VISUAL_TEXT / Travel Request Submitted. No semantic fields,
   planner reasons or server responses are matching inputs. No transport imports.
5. Deterministic, conservative case/whitespace/punctuation-spacing normalization;
   match the full phrase with word boundaries. Sort OCR boxes into reading rows,
   left-to-right within rows; combine only spatially adjacent items (bounded gaps).
   Never accept request/submitted alone. Record contributing confidence values;
   no uncalibrated confidence threshold or fuzzy spelling correction.
6. Fixed safe metadata only: status/reason, old/new observation IDs, known expected
   phrase, contributing IDs/confidences, actual timing counters. No post-action
   screenshots, raw OCR, arbitrary page text or DOM in popup messages or logs.
   Worker retains only the safe verification result for popup reopening; worker
   teardown loses this transient state. Disable concurrent Analyze/Execute.
7. Popup: Waiting for action → VERIFYING → VISUALLY VERIFIED / NOT VERIFIED,
   plus expected evidence, observation and actual privacy status. Keep the original
   guarded Continue evidence visible. No new permission or provider.
8. Test fresh capture/OCR/identity, navigation, tab safety, visual-only positive and
   negative matching, privacy canaries, zero network, bounded failures, orchestration
   and popup. Run all extension/server regressions, check and genuine OCR smoke.
9. Attempt available Chrome demo; accurately leave unobserved manual checks PENDING.
   Update all handoff docs, inspect diff/secrets/artifacts, commit, push normally,
   verify clean tree and HEAD == origin/main, stop. Phase 9 remains untouched.

## Manual baseline

Phase 6B integrated NVIDIA Chrome run PENDING. Phase 7 positive and stale/wrong-page
Chrome runs PENDING. Phase 8 positive and negative Chrome runs PENDING until observed.
