---
type: part
source: eth-tracker.html:5541-5573
status: verified
universe: live
risk: log
verified_at: a8bd703 2026-09-08
---

# my-bets — your own logged bets

Stored in `localStorage` under **`myBets.v1`**.

| Function | Line | Does |
|---|---|---|
| `toggleMyBet` | 5541 | log or un-log a bet |
| `resolveMyBets` | 5557 | settle against the round result |
| `myRecordLine` | 5573 | the W/L form chips |

## If you change this

**Hits** — nothing computational. This is a leaf.

**⚠️ Hits stored user data.** The key is versioned (`.v1`) for a reason. Changing the record
shape without bumping the key silently corrupts every existing user's history — and there is no
server copy to restore from.

**Does not hit** — [probability-engine](probability-engine.md) or the app's own accuracy record.
Your bets and the model's record are separate ledgers. Do not merge them.

## See
`eth-tracker.html:5414`. Prose: `README.md` → *Data persistence*.
