# X Post & Reply Deleter

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Userscript](https://img.shields.io/badge/Userscript-Tampermonkey-0047AB)](https://www.tampermonkey.net/)

A **Tampermonkey** userscript for **[X](https://x.com)** (and legacy **twitter.com** URLs) that helps you **bulk-delete your own posts** from the **`/with_replies`** profile timeline when their visible content matches a **keyword filter**.

Maintained by **[1igaming](https://github.com/1igaming)** · Repository: [`tampermonkey-x-delete`](https://github.com/1igaming/tampermonkey-x-delete)

---

## Overview

On `https://x.com/<username>/with_replies`, the script opens a small control panel. You enter one or more words or phrases (comma- or newline-separated). The script loads timeline history as far as the site allows, then walks the timeline and **permanently deletes** posts authored as that profile when **any** keyword matches **searchable text in the whole post card** (not only the main tweet body): reply context (“Replying to…”), quoted tweets, link/card snippets, image `alt` text, and related visible copy.

An optional checkbox limits matching to posts that are clearly **replies** (social reply context present).

---

## Features

- **Scoped to** `*/with_replies` — does not run on arbitrary X pages.
- **Author check** — only considers tweets whose author matches the profile in the URL (your `with_replies` view).
- **Full-timeline pass** — scrolls to encourage X to load older items, then sweeps top-to-bottom to cope with virtualized lists.
- **Rich text matching** — aggregates multiple DOM regions so filters align with what you actually see in the card.
- **SPA-aware** — re-hooks client navigation so the UI appears when you reach `with_replies` without a full reload.
- **Tampermonkey updates** — `@downloadURL` / `@updateURL` point at the raw script on the `main` branch.

---

## Requirements

| Requirement | Notes |
|-------------|--------|
| [Tampermonkey](https://www.tampermonkey.net/) (or compatible manager) | **GM_addStyle** grant is used for the panel styling. |
| X account | You must be logged in as the owner of the posts you intend to delete. |
| Profile URL | `https://x.com/<YourHandle>/with_replies` (or `https://twitter.com/.../with_replies`). |

---

## Installation

### Option A — Install from URL (recommended)

1. Open Tampermonkey → **Dashboard** → **Utilities** → **Import from URL**.
2. Paste:

   **`https://raw.githubusercontent.com/1igaming/tampermonkey-x-delete/main/x-post-reply-deleter.user.js`**

3. Confirm installation and enable the script.

### Option B — Manual install

1. Open the script on GitHub ([**Raw**](https://github.com/1igaming/tampermonkey-x-delete/raw/main/x-post-reply-deleter.user.js) or [**blob view**](https://github.com/1igaming/tampermonkey-x-delete/blob/main/x-post-reply-deleter.user.js)).
2. Copy the full file contents into a **new script** in Tampermonkey and save.

---

## Usage

1. In the browser where Tampermonkey runs, go to **`https://x.com/<YourHandle>/with_replies`** (the handle must match the account you are cleaning).
2. When the panel appears, enter **filter terms** (comma or newline separated). Matching is **case-insensitive** and uses substring search.
3. Use **Load full timeline** to scroll-load history only, or **Delete matching (full profile)** to run the load phase and then delete all visible matches in the sweep.
4. Confirm the browser confirmation dialog before any deletions run.

Large or old accounts can take **a long time**. X may rate-limit or change the DOM; if something fails, scroll once manually and retry, or open an [issue](https://github.com/1igaming/tampermonkey-x-delete/issues).

---

## Technical notes

- **Virtualization:** X does not keep the entire archive in the DOM at once. The script tracks progress by scrolling and re-scanning; it cannot guarantee every historical post was mounted in the session.
- **Matching scope:** Deliberately broad to reduce “missed” deletes when the keyword appears only in a quote, card, or reply line.
- **No server component:** Everything runs in your browser; no data is sent to this repository or the maintainer.

---

## Disclaimer

Deletions are **irreversible**. You are solely responsible for the filters you enter and for compliance with **X’s Terms of Service** and applicable law. This software is provided **“as is”** without warranty; the author is not liable for misuse, data loss, or enforcement actions by X or third parties. See [LICENSE](LICENSE).

---

## License

**MIT** — see [LICENSE](LICENSE).

Copyright © 2026 [1igaming](https://github.com/1igaming).
