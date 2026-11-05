# Road choice study: Form A, Form B and live analytics

This is a two-stage survey with women, with a backend that does all the maths.

| Page | What it does |
|---|---|
| `docs/form-a.html` | **Form A (Stage 1).** Women list, in their own words, what about a road changes whether they use it, first without and then with mention of safety. Nothing before the safety block (the consent included) mentions safety. |
| `docs/form-b.html` | **Form B (Stage 2).** Best-worst sets built from the most salient Form A parameters. It opens only after you freeze the list. |
| `docs/analytics.html` | **Analytics (researcher only).** Coding of Form A answers, salience, saturation, the freeze step, the **live final ranking** with 95% intervals, quality checks, every response listed by email, and CSV export. |

Every calculation and its source is listed in **[METHODS.md](METHODS.md)**.

## How it fits together

```
Vercel or GitHub Pages (docs/)  --->  Google Apps Script web app (backend/Code.gs + Engine.gs)  --->  Google Sheet
   forms + analytics         validates, stores, does every calculation                       your data
```

- **Free and always on.** Hosting is free and needs no server to maintain. The data stays in a Google Sheet that you own.
- **Ranking updates itself.** The ranking is recomputed from all responses each time the analytics page loads or refreshes, and can refresh automatically every minute.
- **Preview until connected.** While `apiUrl` in `docs/assets/config.js` is empty, the published pages run as a **preview**. Both forms work page by page, every page is labelled *Preview*, Form B uses the 12 placeholder items (Appendix 1 of the questionnaire) and nothing is saved or sent. Analytics says it is not connected. Once `apiUrl` is filled in, the same link becomes the live survey. Do not send a preview link to participants.

## One-time setup (about 15 minutes)

**1. The backend**
1. Create a new Google Sheet (for example "Road choice study data").
2. In the Sheet, open **Extensions → Apps Script**.
3. Replace the contents of `Code.gs` with this repository's `backend/Code.gs`.
4. Add a second script file named `Engine` (the **+** next to Files → Script) and paste `backend/Engine.gs` into it.
5. Select the function `setup` and press **Run**. Allow the permissions it asks for (it only uses this Sheet).
6. Open **Execution log**. It prints your **researcher key**. Keep it private: it opens the analytics page.
7. Press **Deploy → New deployment**, choose type **Web app**, and set:
   - Execute as: **Me**
   - Who has access: **Anyone** (respondents must not need a Google account)
8. Press **Deploy** and copy the **Web app URL** (it ends in `/exec`).

**2. The website**
1. In `docs/assets/config.js`, paste the URL into `apiUrl`.
2. In the same file, fill in `study`: your name, your institution, a contact email and the ethics approval reference. The consent page shows them, and test mode warns while any is empty.
3. Set `supportText` to a helpline suitable for your participants. For India this could mention the Women Helpline 181 and emergency number 112; check the numbers before use.
4. Leave `plannedSampleB` at 50 unless you planned a different Form B sample in advance. The ranking is marked provisional below it.
5. Commit and push to GitHub.
6. Host the `docs/` folder, in either of two ways:
   - **Vercel** (in use: https://thesisresearch.vercel.app). The repository is connected to the Vercel project `thesisresearch`, so each push to `main` redeploys. `vercel.json` sets the output folder to `docs/`, with no build step. To set it up again elsewhere, import the repository at vercel.com/new.
   - **GitHub Pages.** On GitHub, open **Settings → Pages**, set **Deploy from a branch** to `main` and `/docs`, and save. The site will be at `https://divyanshwins.github.io/thesisresearch/`.

**3. Check it**
- Open `form-a.html?test=1` and `form-b.html?test=1`. With `?test=1` your answers are stored as tests and left out of every result.
- Open `analytics.html` and enter the researcher key. **Respondents** lists every response by email, tests included and marked. Tick **Include tests** in the top bar to see the test answers go through coding and the ranking. A banner stays up while it is on, and freezing always ignores tests. Untick it before reading any result.
- `form-b.html?preview=1` shows Form B with the placeholder items, even before the list is frozen. Nothing is sent. Use it to show someone the format.

**If you change the backend code later:** use Deploy → Manage deployments → edit (pencil) → Version: New version. The URL stays the same.

## Running the study

1. **Get ethics approval** for both forms before sending any link. Ask specifically about two things (see METHODS.md):
   - the incomplete disclosure in Form A: the consent describes the study as being about road choice, and safety is named only at the start of the second block, with a debrief at the end;
   - the email address: answers are confidential, not anonymous. State where the emails are kept (your Google Sheet), who sees them (you), and that you delete them when the study ends.
2. **Send the Form A link** (`…/form-a.html`) to women in your target group.
3. **Code the answers.** In Analytics → **Coding**, create codes from the women's words and assign every entry. If an entry names two or three things ("dark and empty"), press **Split** and code each, in the order written. Write each code's label as a neutral dimension, for example "How well lit the road is". The label and one-line description are exactly what Form B respondents will see. Optionally, a second person codes the blind 30% sample (Coder 2) to get Krippendorff's α.
4. **Keep collecting** until **Form A → Saturation** says *Reached*.
5. **Freeze the list.** In **Form B setup**, keep K = 12 unless you have a reason to change it (the allowed range is 8–16), read the checks, and press **Freeze**. Form B opens. The backend refuses labels that presuppose a threat or repeat the word "safe", and parameters listed by only one respondent.
6. **Send the Form B link** to a **different** group of women. Aim for 50 or more counted responses. A Form B response from an email that answered Form A is left out of the ranking automatically (see **Quality**).
7. **Watch the ranking.** **Final ranking** updates as responses arrive. Report the order with its 95% intervals.
8. **Export.** The **Export** tab gives every raw table in long format, ready for R, Stata or SPSS. Emails and names are only in `respondents_by_email.csv`; the other files can be shared.
9. **If someone asks to withdraw.** In **Respondents**, search her email. Then, in the Google Sheet, delete her rows on the **FormA** and **FormB** tabs (each row is one response; press Ctrl+F or Cmd+F and search the email). The analysis updates on the next refresh. If the Form B list was already frozen from her Form A answers, say so in the report.
10. **When the study ends,** delete the emails and names as the consent promises. Download the export, keep every file except `respondents_by_email.csv` (those files hold all the answers, linked only by random IDs), then delete `respondents_by_email.csv` and the Google Sheet.

## Working on the code locally

```bash
npm test
```
This runs the hand-worked maths checks, the backend flow and the form-wording checks.

```bash
npm run dev
```
This starts a local preview at http://localhost:8787. It runs the real backend against a stand-in for Google Sheets, and the researcher key is `dev-key`.

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

Needs Node 20+ and nothing else; Python, numpy and scipy are only for the cross-check.

## Files

```
backend/Engine.gs      all calculations (pure functions, documented as M1–M14)
backend/Code.gs        Apps Script web app: storage, validation, researcher actions
docs/                  the website (the hosted folder)
  assets/config.js     backend address and study details (the only file to edit)
  assets/preview.js    placeholder Form B used only while no backend is connected
  assets/questions.js  the exact wording of both forms
  assets/survey.js     form runner (branching, timing, drafts, submission)
  assets/form-b.js     best-worst sets with per-respondent randomisation
  assets/analytics.js  dashboard
dev/                   local preview server, Apps Script stand-in, end-to-end simulator, sample-size simulation
test/                  unit, backend and wording tests; Python cross-check
METHODS.md             formulas, sources, limitations
```

## Privacy, navigation and security

- **What is stored.** Each response has a random ID, the respondent's email address (required) and name (optional), her answers, and the time spent on each page (used only for the speed check). The email and name sit beside the answers, not in them.
- **What the email does.** Each woman counts once in each form: a later response from the same email stays in the Sheet but is left out of the analysis. A Form B response from an email that answered Form A is left out of the ranking, because Form B needs different women. Tests are matched only with tests.
- **Who sees it.** Only someone with the researcher key, on the **Respondents** tab and in `respondents_by_email.csv`. Every other export links answers through the random ID alone, and `results.json` leaves the emails out. Never put an email in a report.
- **Device flag.** The browser still remembers that a form was submitted on that device, but this is no longer used in the analysis: a phone is often shared, and the email tells people apart. Test runs (`?test=1`) are remembered separately. The consent page says that answers are kept on the device until submission.
- **Back button.** Every page has Back, except the first page of the safety block in Form A. Going back there would let a respondent revise her unprimed answers after safety was named. The last unprimed page warns her before she leaves it. On the first page, Back leaves the survey. After a screen-out (no consent, not eligible), Back returns to the question so that a mis-tap can be corrected; nothing is kept on the device unless she does.
- **Third parties.** The pages load the Geist typeface from Google Fonts; nothing else is loaded from outside the site and the backend.
- **Researcher key.** Analytics, coding, freezing and export need the researcher key. The key is checked by the backend, never stored in this repository, and kept only for the open browser tab.
- **The Sheet.** Do not share the Google Sheet with anyone. It holds the raw answers and the email addresses.
