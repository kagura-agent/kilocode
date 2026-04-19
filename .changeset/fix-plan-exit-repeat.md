---
"@kilocode/cli": patch
---

fix(plan): prevent "Ready to implement?" popup from repeating after selecting "Continue here"

When a user selects "Continue here" on the plan follow-up prompt, a synthetic user message
is injected with `agent: "code"`. The `shouldAskPlanFollowup` check now skips triggering
the prompt when the last user message has already transitioned away from the plan agent,
preventing the popup from appearing repeatedly.

Fixes #9144
