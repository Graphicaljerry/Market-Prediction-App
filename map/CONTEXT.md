# How to walk this map

One job: let a session answer *what is X* and *what else moves if I change X* without reading
6,299 lines of `eth-tracker.html`.

## Inputs
- Working (this session): the change you were asked to make
- Reference (every time): `objects/_index.md`
- Reference (every time): `../CLAUDE.md` — the project's standing rules

## Process
1. Read `objects/_index.md`. Find the part your change lands in.
2. Open that one card. Read **If you change this → Hits / Does not hit**.
3. Open only the cards it names. Two hops is the budget.
4. Jump to the cited line in the source before writing anything. The card orients; the code
   specifies.

## Reading a citation

`renderHero:5617` means `eth-tracker.html`, line 5617. Worker functions are marked
`worker.js:939`. Open with `sed -n '5617,5680p' eth-tracker.html` rather than loading the file.

**Line numbers drift.** They were true at commit `a8bd703`. If the line is wrong, grep the
function name — the name is stable, the number is not — and fix the card in your commit.

## The rule this map protects

The project's standing rule (`../CLAUDE.md`) is that changes to **picks / commitment /
confidence** are riskier than changes to the **log / measurement**, and must be called out
explicitly. Every card states which side it is on. Read that line before you touch anything.

## Human check
Pick a part you did not write. Can you say what it does, where it lives, and what it touches
from its card alone? If not, the card is too thin.
