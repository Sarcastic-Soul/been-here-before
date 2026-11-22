# Ledger anchors

Every day the site writes down its verdict for the top 100 coins and chains the day's lines into a SHA-256 root (see https://been-here-before.vercel.app/ledger). A scheduled GitHub Action on `main` copies each new root into `anchors.txt` on this branch.

The Action also checks that every root already here still matches what the site serves. If any old prediction were edited in the database, its day's root, and every root after it, would change, and the Action would fail.

The commit history and the Action run logs give each root a timestamp that does not depend on the site.

To check by hand:

```
curl -s https://been-here-before.vercel.app/api/ledger | jq -r '.days[] | "\(.day) \(.count) \(.root)"'
```

and compare with `anchors.txt`. To recompute a root from the day's lines, use the "Check a root" box on the ledger page or the formula in `/api/ledger`.
