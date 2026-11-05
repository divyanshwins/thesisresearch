# Road choice study: Form A, Form B and live analytics

This is a two-stage survey with women, with a backend that does all the maths. It runs on **Vercel and GitHub only**, and it is live.

| Page | Address | What it does |
|---|---|---|
| Form A | https://thesisresearch.vercel.app/form-a.html | **Stage 1.** Women list, in their own words, what about a road changes whether they use it, first without and then with mention of safety. Nothing before the safety block (the consent included) mentions safety. |
| Form B | https://thesisresearch.vercel.app/form-b.html | **Stage 2.** Best-worst sets built from the most salient Form A parameters. It opens only after you freeze the list. |
| Analytics | https://thesisresearch-git-main-divyanshsrivastavas-projects.vercel.app/analytics.html | **Researcher only.** Vercel asks you to sign in with the account that owns the project; there is no other password. Coding, salience, saturation, the freeze, the **live final ranking** with 95% intervals, quality checks, every response by email, and the Excel and CSV export. |

Every calculation and its source is listed in **[METHODS.md](METHODS.md)**.

## How it fits together

```
 respondent's phone        thesisresearch.vercel.app          Vercel Blob store "thesis-responses"
 Form A / Form B   ----->  docs/  the pages                    (private, Mumbai region)
                           api/   checks every answer,  ----->   responses/A/<id>.json
                                  saves it, does the maths        responses/B/<id>.json
 you, signed in to Vercel                                         state.json (coding, freeze)
 analytics  ---->  thesisresearch-git-main-…vercel.app  (same site; Vercel lets only your account in)
```

- **GitHub** (`divyanshwins/thesisresearch`) holds the code. A push to `main` redeploys the site.
- **Vercel** runs the pages and the one backend function (`api/index.js`), in the Mumbai region.
- **The answers** are in a **private** Vercel Blob store connected to the project. Each response is one file, written once.
  - The store's credentials are created and held by Vercel itself. No password, token or key exists in the code, in GitHub or in any browser.
- **Analytics** works only at the project's private Vercel address, which Vercel's Deployment Protection opens only to your Vercel account. The public address never shows results.
- **Excel.** Analytics → **Export** gives one Excel workbook with everything, a shareable copy without emails, and a CSV per table.

## Setup

Nothing is left to do: the store is created and connected, and the live site saves answers. For the record, it was set up with:

```bash
npx vercel link --yes --project thesisresearch
```

```bash
npx vercel blob create-store thesis-responses --access private --region bom1 --yes --environment production
```

**Before sending links,** fill in `study` in `docs/assets/config.js`:
- your name and institution;
- a contact email;
- the ethics approval reference;
- `supportText`, a helpline for your participants (for India this could mention 181 and 112, checked before use).

Then commit and push. Test mode (`?test=1`) warns while any of these is empty.

**To check it yourself:**
- Open `…/form-a.html?test=1`, fill it in and submit.
- Open the analytics address above and sign in to Vercel. **Respondents** lists your answer as "Test, left out".
- Tick **Include tests** to see it go through the analysis; untick it before reading any result.
- To delete the test, use **Remove someone's answers** with the email you used.

## The free plan's limits, and how the site stays inside them

Vercel's free (Hobby) plan allows, each month:
- **2,000 uploads and listings;**
- **10,000 uncached reads;**
- **1 GB of storage.**

If a limit is passed, the store is locked until the month resets. Vercel emails before that happens. The site is built to use a small part of this:

| What | Cost | A whole study |
|---|---|---|
| One submitted response | 1 upload + 1 read | about 150 responses → 150 uploads |
| Opening a form | read from the cache (free) | — |
| Loading or refreshing analytics | 1 listing (reused for 20 s); each response is downloaded once, ever | 20 refreshes a day for 2 months → about 1,200 listings in total, spread over the months |
| Coding, freezing | 1 upload per save | a few hundred |

So: **refresh analytics when you want new numbers, not constantly** (it no longer refreshes by itself), and avoid browsing the store in the Vercel dashboard, which also counts.

## Running the study

1. **Get ethics approval** for both forms before sending any link. Ask specifically about two things (see METHODS.md):
   - the incomplete disclosure in Form A: the consent describes the study as being about road choice, and safety is named only at the start of the second block, with a debrief at the end;
   - the email address: answers are confidential, not anonymous. State where the data is kept (a private Vercel Blob store in Mumbai), who sees it (you), and that you delete it when the study ends.
2. **Send the Form A link** to women in your target group.
3. **Code the answers.** In Analytics → **Coding**:
   - Create codes from the women's words and assign every entry.
   - If an entry names two or three things ("dark and empty"), press **Split** and code each, in the order written.
   - Write each code's label as a neutral dimension, for example "How well lit the road is". The label and one-line description are exactly what Form B respondents will see.
   - Optionally, a second person codes the blind 30% sample (Coder 2) to get Krippendorff's α.
4. **Keep collecting** until **Form A → Saturation** says *Reached*.
5. **Freeze the list.** In **Form B setup**, keep K = 12 unless you have a reason to change it (the allowed range is 8–16), read the checks, and press **Freeze**. Form B opens within a minute. The backend refuses labels that presuppose a threat or repeat the word "safe", and parameters listed by only one respondent.
6. **Send the Form B link** to a **different** group of women. Aim for 50 or more counted responses. A Form B response from an email that answered Form A is left out of the ranking automatically (see **Quality**).
7. **Watch the ranking.** Press **Refresh** in **Final ranking** to see new responses. Report the order with its 95% intervals.
8. **Export.** **Export** gives:
   - the PRIVATE Excel workbook, with every sheet including emails;
   - a shareable workbook without emails;
   - a CSV per table, ready for R, Stata or SPSS.
9. **If someone asks to withdraw.** In **Respondents**, use **Remove someone's answers**: type her email twice and press **Remove**. Every response from that email is deleted from the store at once and leaves the analysis. If Form B was already frozen from her Form A list, say so in the report.
10. **When the study ends,** delete the emails, as the consent promises:
    - download the shareable workbook (and the CSVs if you want them), which hold every answer linked only by random IDs;
    - delete the private workbook;
    - delete the store, which is permanent: `npx vercel blob delete-store` (or Vercel → Storage → thesis-responses → Settings → Delete).

## Security: what protects what

| Risk | What stops it |
|---|---|
| Someone reads the answers | The Blob store is private: every read needs credentials that only the Vercel project has. Nothing in GitHub or in the pages can open it. |
| Someone opens analytics | Researcher actions work only at the project's private Vercel address, which Vercel's sign-in opens only to your account. The function also checks that: <br>• the request really came in on that address (a forged forwarding header does not count); <br>• it came from a page on that address (another website cannot send it on your behalf); <br>• Vercel's protection is switched on. <br>If the protection were ever turned off, analytics refuses to open rather than becoming public. |
| Someone sends fake or malformed answers | The server re-checks every answer (eligibility, email format, allowed values, lengths, the Form B design) and never trusts the browser. A hidden honeypot field drops simple bots. Requests over 200,000 characters are refused. |
| Someone injects code into the pages | Every respondent text is shown as text, never as HTML. A strict Content Security Policy (in `vercel.json`) lets the pages run only their own scripts and talk only to their own site. They cannot be framed by another site. |
| A secret leaks from the code | There is none to leak. A test fails if anything that looks like a token is ever committed. `.vercel/` and `.env*` are ignored by git. |
| Two people submit at once | Each response is its own file. Settings changes are refused if someone else changed them first. |

**Who has access.**
- **You**, through your Vercel and GitHub accounts.
- **Me (Claude)**, only while we work here on your Mac, through this Mac's Vercel login (`npx vercel curl` reaches the private address) and its GitHub login. I have no account of my own and hold no password.
- **Nobody else.**

Optional: make the code repository private. On GitHub, open `divyanshwins/thesisresearch` → Settings → Change visibility. It holds no answers and no secrets, but it does describe the study design, including the incomplete disclosure.

## Working on the code locally

```bash
npm test
```
This runs:
- the hand-worked maths checks;
- the backend flow on three stores: a local file, Vercel Blob (against a stand-in that counts operations) and GitHub (against a stand-in GitHub);
- the Vercel function's access rules;
- the Excel writer;
- the form-wording checks.

```bash
npm run dev
```
This starts a local preview at http://localhost:8787. It runs the real backend with the data in `dev/data/local.json`, and the researcher key is `dev-key`. Two variants:
- `TRUSTED=1 npm run dev` opens analytics with no key, as at the private Vercel address;
- `MISSING=storage npm run dev` shows the site before storage is connected.

```bash
npm run simulate
```
With `npm run dev` running in another terminal, this sends synthetic respondents end to end and checks that the ranking recovers the known truth.

```bash
npm run crosscheck
```
This compares the engine with an independent Python/SciPy implementation.

```bash
npm run power
```
This runs the Form B sample-size simulation (about 30 seconds) behind the table in METHODS.md.

Needs Node 20+. Python is only needed for the cross-check (numpy, scipy) and the Excel check (openpyxl).

**Other storage.** If `GITHUB_TOKEN` is set in Vercel (a fine-grained token with Contents read and write on one private repository, named by `DATA_REPO`), the function stores answers in that repository instead. If `RESEARCHER_KEY` is set (16+ characters), that key also opens analytics from the public address. Neither is set now.

## Files

```
api/index.js             the Vercel function at /api: chooses the storage, decides who is a researcher
backend/app.js           every backend action: checks, saving, researcher actions
backend/engine.js        all calculations (pure functions, documented as M1–M14)
backend/store-blob.js    the private Vercel Blob store (in use)
backend/store-github.js  a private GitHub repository (alternative)
backend/store-file.js    a local file (local preview and tests)
docs/                    the website
  assets/config.js       study details shown on the consent page
  assets/preview.js      placeholder Form B used only in preview
  assets/questions.js    the exact wording of both forms
  assets/survey.js       form runner (branching, timing, drafts, submission)
  assets/form-b.js       best-worst sets with per-respondent randomisation
  assets/analytics.js    dashboard
  assets/xlsx.js         the Excel writer
vercel.json              hosting settings, region and security headers
dev/                     local preview server, end-to-end simulator, sample-size simulation
test/                    unit, backend, Vercel, Excel and wording tests; stand-ins for Blob and GitHub; Python cross-check
METHODS.md               formulas, sources, limitations
```

## Privacy and navigation

- **What is stored.** Each response holds:
  - a random ID;
  - the respondent's email address (required) and name (optional);
  - her answers;
  - the time spent on each page, used only for the speed check.

  The email and name sit beside the answers, not in them.
- **What the email does.**
  - Each woman counts once in each form. A later response from the same email stays in the data but is left out of the analysis.
  - A Form B response from an email that answered Form A is left out of the ranking, because Form B needs different women.
  - Tests are matched only with tests.
- **Who sees it.**
  - Only you, on the **Respondents** tab, in the PRIVATE workbook and in `respondents_by_email.csv`.
  - Every other export links answers through the random ID alone.
  - Never put an email in a report.
- **Device flag.** The browser still remembers that a form was submitted on that device, but this is not used in the analysis. A phone is often shared, and the email tells people apart.
- **Back button.**
  - Every page has Back, except the first page of the safety block in Form A. Going back there would let a respondent revise her unprimed answers after safety was named; the last unprimed page warns her before she leaves it.
  - On the first page, Back leaves the survey.
  - After a screen-out (no consent, not eligible), Back returns to the question so that a mis-tap can be corrected.
- **Third parties.**
  - The pages load the Geist typeface from Google Fonts. Nothing else is loaded from outside the site.
  - Vercel hosts the pages, the function and the data.
