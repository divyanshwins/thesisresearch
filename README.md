# Road choice study: Form A, Form B and live analytics

This is a two-stage survey with women, with a backend that does all the maths. It runs on **Vercel and GitHub only**.

| Page | What it does |
|---|---|
| `docs/form-a.html` | **Form A (Stage 1).** Women list, in their own words, what about a road changes whether they use it, first without and then with mention of safety. Nothing before the safety block (the consent included) mentions safety. |
| `docs/form-b.html` | **Form B (Stage 2).** Best-worst sets built from the most salient Form A parameters. It opens only after you freeze the list. |
| `docs/analytics.html` | **Analytics (researcher only).** Coding of Form A answers, salience, saturation, the freeze step, the **live final ranking** with 95% intervals, quality checks, every response listed by email, and the Excel and CSV export. |

Every calculation and its source is listed in **[METHODS.md](METHODS.md)**.

## How it fits together

```
 respondent's phone            Vercel (this repository)                     GitHub (private)
 form-a / form-b pages  --->   docs/  the pages                             thesisresearch-data
 analytics page                api/   the backend: checks every answer, --->  responses/A/<id>.json
                                      saves it, runs every calculation        responses/B/<id>.json
                                                                              state.json (coding, freeze)
```

- **Two repositories, both private.**
  - **`thesisresearch` (this one) holds the code.** Vercel publishes it at https://thesisresearch.vercel.app and redeploys on every push to `main`.
  - **`thesisresearch-data` holds only the answers.** Each response is one JSON file, saved as its own commit, so the history is a dated record of every response. Vercel is not connected to it.
- **The backend** is one Vercel function (`api/index.js`). It reaches the data repository with a GitHub token that lives only in Vercel's encrypted settings. The token is never sent to a browser and never stored in a repository.
- **The ranking updates itself.** It is recomputed from all responses each time the analytics page loads, and can refresh every minute.
- **Excel.** Analytics → **Export** gives one Excel workbook with everything, a shareable copy without emails, and a CSV per table.
- **Until the two secrets are set** (step 4 below), the published forms run as a labelled **preview**: they work page by page and save nothing. Analytics says which setting is missing.

## One-time setup (about 10 minutes, all on github.com and vercel.com)

**1. Make this repository private.** On GitHub, open `divyanshwins/thesisresearch` → **Settings** → **General** → at the bottom, **Change visibility** → **Make private**. Vercel keeps deploying it.

**2. Create the data repository.** On GitHub, **New repository**:
- Name `thesisresearch-data`, **Private**, tick **Add a README file**, and press **Create repository**.
- Do not connect it to Vercel.

**3. Create a token that can reach only that repository.** In GitHub, open **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**:
- **Token name:** `thesis survey`.
- **Expiration:** a date after the study ends. When it expires the forms stop saving, so diarise it.
- **Repository access:** **Only select repositories** → `thesisresearch-data`.
- **Permissions → Repository permissions → Contents:** **Read and write**. Leave everything else as it is.
- Press **Generate token** and copy it. GitHub shows it once.

**4. Give the two secrets to Vercel.** In Vercel, open the project `thesisresearch` → **Settings** → **Environment Variables**, and add two variables for **Production**:
- `GITHUB_TOKEN`: the token you just copied.
- `RESEARCHER_KEY`: a password of your own, at least 16 characters. It opens the analytics page; keep it in your password manager.

Optional: `DATA_REPO`, if the data repository is not `divyanshwins/thesisresearch-data`.

**5. Redeploy.** Vercel uses new settings only in a new deployment: **Deployments** → the newest one → **⋯** → **Redeploy**.

**6. Check it.**
- Open `…/form-a.html?test=1`. The **Preview** label should be gone. Fill it in and submit. A file appears in `thesisresearch-data/responses/A/`.
- Open `…/analytics.html`, enter your researcher key, and open **Respondents**. Your test response is listed as "Test, left out". Tick **Include tests** to see it go through coding and the ranking; untick it before reading any result.
- `…/form-b.html?preview=1` shows Form B with the placeholder items, even before the list is frozen. Nothing is sent.

**7. Fill in the study details.** In `docs/assets/config.js`, fill in `study` (your name, institution, a contact email, the ethics approval reference) and `supportText` (a helpline for your participants; for India this could mention 181 and 112, checked before use). Commit and push. Test mode warns while any study detail is empty.

## Running the study

1. **Get ethics approval** for both forms before sending any link. Ask specifically about two things (see METHODS.md):
   - the incomplete disclosure in Form A: the consent describes the study as being about road choice, and safety is named only at the start of the second block, with a debrief at the end;
   - the email address: answers are confidential, not anonymous. State where the data is kept (a private GitHub repository), who sees it (you), and that you delete the emails when the study ends.
2. **Send the Form A link** (`…/form-a.html`) to women in your target group.
3. **Code the answers.** In Analytics → **Coding**, create codes from the women's words and assign every entry. If an entry names two or three things ("dark and empty"), press **Split** and code each, in the order written. Write each code's label as a neutral dimension, for example "How well lit the road is". The label and one-line description are exactly what Form B respondents will see. Optionally, a second person codes the blind 30% sample (Coder 2) to get Krippendorff's α.
4. **Keep collecting** until **Form A → Saturation** says *Reached*.
5. **Freeze the list.** In **Form B setup**, keep K = 12 unless you have a reason to change it (the allowed range is 8–16), read the checks, and press **Freeze**. Form B opens. The backend refuses labels that presuppose a threat or repeat the word "safe", and parameters listed by only one respondent.
6. **Send the Form B link** to a **different** group of women. Aim for 50 or more counted responses. A Form B response from an email that answered Form A is left out of the ranking automatically (see **Quality**).
7. **Watch the ranking.** **Final ranking** updates as responses arrive. Report the order with its 95% intervals.
8. **Export.** **Export** gives:
   - the PRIVATE Excel workbook, with every sheet including emails;
   - a shareable workbook without emails;
   - a CSV per table, ready for R, Stata or SPSS.
9. **If someone asks to withdraw.** In **Respondents**, use **Remove someone's answers**: type her email twice and press **Remove**. Every response from that email is deleted from the data repository and leaves the analysis at once. Git keeps the deleted file in the repository's history until step 10. If Form B was already frozen from her Form A list, say so in the report.
10. **When the study ends,** delete the emails, as the consent promises:
    - download the shareable workbook (and the CSVs if you want them), which hold every answer linked only by random IDs;
    - delete the private workbook;
    - delete the `thesisresearch-data` repository (Settings → Delete this repository), which also removes its history;
    - delete the GitHub token.

## Security: what protects what

| Risk | What stops it |
|---|---|
| Someone reads the answers | The data repository is private. Only your GitHub account can open it. The backend opens it with a token that reaches that one repository, held only in Vercel. |
| Someone opens the analytics page | Every researcher action needs the researcher key. It is checked on the server in constant time, with a pause after a wrong key, and kept only in the open browser tab. |
| Someone sends fake or malformed answers | The server re-checks every answer (eligibility, email format, allowed values, lengths, the Form B design) and never trusts the browser. A hidden honeypot field drops simple bots. Requests over 200,000 characters are refused. |
| Someone injects code into the pages | Every respondent text is shown as text, never as HTML. A strict Content Security Policy (in `vercel.json`) lets the pages run only their own scripts and talk only to their own site. They also cannot be framed by another site. |
| The token leaks from the code | It is never in the code. `git grep` finds no token, and `.vercel/` is ignored. |
| Two people submit at once | Each response is its own file, and a clashing commit is retried. Settings changes are refused if someone else changed them first. |

**Who has access.**
- **You**, through your GitHub and Vercel accounts.
- **Me (Claude)**, only while we work here on your Mac, through this Mac's GitHub login (git over SSH) and Vercel login. I have no account of my own and no copy of the token.
- **Nobody else**, unless you invite them on GitHub.

## Working on the code locally

```bash
npm test
```
This runs the hand-worked maths checks, the backend flow on a local file and through the GitHub storage code (against a stand-in GitHub in `test/github-mock.js`), the Vercel function, the Excel writer and the form-wording checks.

```bash
npm run dev
```
This starts a local preview at http://localhost:8787. It runs the real backend with the data in `dev/data/local.json` instead of GitHub, and the researcher key is `dev-key`. `MISSING=GITHUB_TOKEN npm run dev` shows how the site looks before Vercel has its secrets.

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

Needs Node 20+ and nothing else. Python is only needed for the cross-check (numpy, scipy) and the Excel check (openpyxl).

## Files

```
api/index.js             the Vercel function at /api (reads its secrets from Vercel)
backend/app.js           every backend action: checks, saving, researcher actions
backend/engine.js        all calculations (pure functions, documented as M1–M14)
backend/store-github.js  saving to and reading from the private data repository
backend/store-file.js    the same, in a local file (local preview and tests)
docs/                    the website
  assets/config.js       study details shown on the consent page
  assets/preview.js      placeholder Form B used only in preview
  assets/questions.js    the exact wording of both forms
  assets/survey.js       form runner (branching, timing, drafts, submission)
  assets/form-b.js       best-worst sets with per-respondent randomisation
  assets/analytics.js    dashboard
  assets/xlsx.js         the Excel writer
vercel.json              hosting settings and security headers
dev/                     local preview server, end-to-end simulator, sample-size simulation
test/                    unit, backend, Vercel, Excel and wording tests; stand-in GitHub; Python cross-check
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
  - Only someone with the researcher key, on the **Respondents** tab, in the PRIVATE workbook and in `respondents_by_email.csv`.
  - Every other export links answers through the random ID alone.
  - Never put an email in a report.
- **Device flag.** The browser still remembers that a form was submitted on that device, but this is not used in the analysis. A phone is often shared, and the email tells people apart.
- **Back button.**
  - Every page has Back, except the first page of the safety block in Form A. Going back there would let a respondent revise her unprimed answers after safety was named; the last unprimed page warns her before she leaves it.
  - On the first page, Back leaves the survey.
  - After a screen-out (no consent, not eligible), Back returns to the question so that a mis-tap can be corrected.
- **Third parties.**
  - The pages load the Geist typeface from Google Fonts. Nothing else is loaded from outside the site.
  - Vercel hosts the pages and the function. GitHub holds the data.
