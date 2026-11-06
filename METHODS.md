# Methods: what the system calculates, and the source for each step

This file is the academic justification for every number the analytics page shows and for every design decision in the two forms. Section numbers (M1–M14) match the comments in `backend/engine.js`, where all the calculations run.

**How the calculations are checked**
- `test/engine.test.js` checks each calculation against a hand-worked example or a published value.
- `test/crosscheck/crosscheck.py` re-implements the main ones independently in Python/SciPy (`npm run crosscheck`).
- `dev/simulate.js` and `dev/power.js` run simulated respondents through the real code.

**Verification key**
- ✔ The original source, or its publisher's page, was opened and the formula or parameter checked against it.
- ◐ Checked through the abstract or a secondary source that quotes it.
- ◻ Cited from the standard literature but not re-opened. Check the original before submission.

---

## Study design in one paragraph

The study has two stages, with different women in each.

- **Stage 1 (Form A).** Women say, in their own words, what about a road changes their choice to use it.
  - First the question is asked without mentioning safety (Block 1, A2.2). Then it is asked about safety (Block 2, A3.4).
  - Each list is preceded by the same episode question ("in the last 12 months, was there a time when … you chose a different road"), first for any reason (A2.1), then with safety as the reason (A3.1). After a yes to A3.1, she can describe that most recent occasion (a critical incident).
  - The answers are coded into parameters, and the parameters are ranked by cognitive salience.
- **Stage 2 (Form B).** A separate sample of women sees the most salient parameters in best-worst sets. A choice model turns their choices into ranked importance weights, with 95% intervals.

The parameters come from the target population, not from an expert panel. That is the argument for not using a Delphi round (see "What a reviewer may ask" below).

---

## Stage 1: Form A

### Question design
| Rule | Where | Source |
|---|---|---|
| Ask about a specific recent episode, not a general opinion | A2.1, A3.1–A3.3 | Flanagan (1954) ◻ |
| Free listing in the respondent's own words, in the order the items come to mind | A2.2, A3.4 | Weller & Romney (1988) ◻ |
| **General before specific (funnel).** Block 1 never mentions safety, and the consent page does not either. Block 2 opens by saying it is about safety. Back is locked from Block 2 to Block 1, and the last Block 1 page says so before the respondent leaves it. | A2 → A3 | Dillman, Smyth & Christian (2014) ◻; Tourangeau, Rips & Rasinski (2000) ◻ |
| **Profile questions go last.** "Alone or with other people" would cue safety before the unprimed list, and demographic questions belong at the end in any case. Eligibility screening stays first. | A4 | Dillman et al. (2014) ◻; context effects in Tourangeau et al. (2000) ◻ |
| **No presupposition.** A filter question comes before every follow-up, and each list has a "Nothing…" option. | A3.1 → A3.2–A3.3; A2.2, A3.4 | Schaeffer & Presser (2003) ◻ |
| **One question, two reasons.** A2.1 and A3.1 ask the same thing (did she choose a different road, or not use a road), first for any reason other than time or distance, then because of how safe the road felt. The two shares can therefore be compared directly, and a yes to A3.1 is a special case of a yes to A2.1. | A2.1, A3.1 | parallel wording; Schuman & Presser (1981) ◻ |
| **Ordered options in their natural order.** Daytime, dawn or dusk, after dark, then "I don't remember". | A3.3 | Tourangeau, Couper & Conrad (2004) ◐ |
| Both directions in the wording ("more safe or less safe"; "safe or unsafe") | A3.1, A3.4 | Krosnick & Presser (2010) ◻ |
| **No forced answers.** Only consent, eligibility and the email address are required. An empty question gets one gentle reminder (a soft prompt). Forcing answers raises drop-out and lowers answer quality. | all | Décieux et al. (2015) ◐ |
| **Answer boxes.** Five boxes are shown, and a new one opens when the last is filled, up to ten. The number of boxes cues how many answers are expected, so it is the same for everyone. Smith's S is normalised by list length. | A2.2, A3.4 | Keusch (2014) ◐ |
| Respondent debriefing ("was any question unclear?") replaces a separate pre-test | A5.1, B5.1, B5.2 | Presser et al. (2004) ◻ |

### What was cut, and why (version 3)
The rule: a question stays only if a stated result of the study depends on it. Each question below fed nothing but a descriptive table, or repeated another question.

| Removed | Why |
|---|---|
| "What did you do?" (asked twice, A2.3 and A3.3 in version 2) | It recorded the *response* to a road (another road, another mode, going with someone), not the *road features that caused it*. The research question is which features change the choice; the response is a different construct (coping strategy) that no later step used. The episode question already records that the choice changed. |
| The Block 1 story (A2.2 in version 2) | It asked the same thing as the Block 2 story, which is kept: the study's focus is the safety episode, and the unprimed block needs only its list. |
| "Matters differently after dark" (A3.6) | Form B has one criterion and no day/night split, so these answers could not change any result. Time of day is kept as one tap (A3.3), and lighting comes up in the lists in any case. |
| "Anything else about a road…" (A3.7) | It repeated the free list it followed, which already asks for everything about a road, with up to ten boxes. |
| "How often do you travel?" (A4.2) | Screening already requires road use in the last 12 months, and no analysis is split by frequency. |
| "Did you take part before?" (B4.6) | Replaced by matching email addresses with Form A, which does not rely on memory. |

The two episode questions and the two lists look alike on purpose: asking the same question without and then with safety is the comparison the unprimed check rests on.

### Consent and incomplete disclosure (ethics committee decision)
- **What the consent says.** The Form A consent describes the study as "how women choose which roads to use in everyday travel". It does not use the word safety. If it did, Block 1 would no longer be unprimed, and the unprimed hypothesis check would be invalid.
- **When safety is disclosed.** Safety is named at the start of Block 2, together with a reminder that any question can be skipped. After submitting, the respondent sees a debrief explaining the order.
- **Ethics approval.** This is incomplete disclosure. It needs the explicit approval of the institute ethics committee; the ICMR (2017) national guidelines have provisions for it ◐. If the committee requires the topic to be named up front, put the safety sentence back in the consent. Then report the unprimed check as primed, or drop it.
- **The consent page is a participant information sheet with an electronic consent** (titled "Information and consent", version 3.0, dated 5 November 2026). It follows the elements the ICMR National Ethical Guidelines (2017, Box 5.1) require of an informed consent document ◐ (checked through the summary in PMC6644181, Table 3; check Box 5.1 in the original):

  | ICMR element | Where it is on the page |
  |---|---|
  | A statement that this is research | "What this study is about": "This is a research study about…" |
  | Purpose and methods | Same paragraph: the topic, and "You will answer short questions…" (Form B: "compare sets of four features of a road") |
  | Duration and data collected | "about 5 minutes" (Form B: 7); "What is recorded": answers, email, optional name, page times |
  | Foreseeable discomfort | "Possible discomfort and benefit": no known disadvantage beyond the time; skip or stop if a question feels uncomfortable |
  | Benefits | Same paragraph: no direct benefit; may help plan roads and routes that better suit women's needs |
  | Confidentiality | "What is recorded, and who sees it": the research team only; kept apart from the answers; never reported or shared; stored on a private server in Mumbai, India |
  | Payment and compensation | "There is no payment or other compensation for taking part." |
  | Voluntary participation and withdrawal | "Taking part is voluntary": skip, stop, no consequences; "Withdrawing later": removal on request before publication |
  | Research team and contacts | "Who is doing it": researcher, programme, department, institution, supervisor, contact email (from `config.js`) |
  | Ethics approval | "Ethics approval": committee, reference and the committee's contact for concerns about participants' rights (from `config.js`; shown only once filled in) |

  - **The consent declaration** is one choice: "By choosing 'I agree', you confirm that you have read this information, that you are taking part voluntarily, and that your answers may be used as described." Electronic consent needs the ethics committee's approval (ICMR 2017 ◐).
  - **A copy to keep.** "Save or print this information" prints the sheet alone, opened in full.
  - **Layered presentation.** Always shown:
    - the topic;
    - the research team and contact;
    - a three-point summary: voluntary, the email is private, research use only.

    The rest of the sheet opens under "Read the full information", so the page is short on a phone while every element stays one tap away. Layered consent of this kind is common in online research; mention it to the ethics committee.
  - **Wording.** No sentence before Block 2 of Form A names safety, a threat, harm or risk (a test checks every word, the study details included). The discomfort statement is therefore written as "no known disadvantages… if a question feels uncomfortable", which keeps the required information without priming the unprimed block.
- **Researcher details.** These come from `config.js`:
  - **filled in:** researcher, programme, department, institution and contact;
  - **still to add:** the supervisor, and the ethics committee's name, approval reference and contact, after approval.

  Test mode warns while any of them is empty, and the ethics paragraph is not shown until all three ethics fields are filled.
- **Language.** The forms are in English only. Several Indian institutes ask for the information sheet in English and in the local language as well (IIT Kanpur and IIT Delhi state this in their submission formats ◐). If the committee asks for Hindi, the sheet and the questions need forward and back translation before fielding.

### Email address: one response per person, and two separate samples
- **What is asked.** An email address (required) and a name (optional), on the "About you" page, after the three screening questions, so that a woman who is screened out is never asked for them.
- **What it is for.**
  - **One response per person.** A later response from the same email is kept in the data but left out of the analysis, and her first response is used. In Form A this is the one given before she had seen the safety block, so it is the only one whose first list is unprimed.
  - **Two separate samples.** Form B is meant for women who did not answer Form A, because Form A respondents have already listed and thought about these features. A Form B response whose email matches a real Form A response is left out of the ranking and counted. Before, this rested on a self-report question and a device mark, which can only flag it.
  - **Withdrawal.** A woman can ask for her answers to be deleted, which is impossible with anonymous data.
- **Matching rule.** Emails are trimmed and compared in lower case. Tests are matched only with tests, and a Form B test is checked only against real Form A responses, so a trial run never removes a real response.
- **The device marks** (this browser had submitted a form before) are still stored but no longer used, because a phone is often shared and the email tells people apart.
- **Confidential, not anonymous.** The email and name are stored beside the answers, not in them. In the exports they are only in `respondents_by_email.csv`; every other file links answers to a person through a random respondent ID alone (pseudonymised), so it can be shared. Only the researcher, signed in to Vercel at the study's private address, can open them. The emails must be deleted when the study ends, as the consent says.
- **Cost to state.** Identified responses can lower reporting on sensitive topics compared with anonymous ones (Tourangeau & Yan 2007 ◻). The forms ask about road features, not about incidents, which limits this. Report it as a limitation.
- **Format check.** The same pattern is used in the form and on the server (something@domain.tld, no spaces, at most 254 characters, the longest deliverable address under RFC 5321 ◻). A typo in an otherwise valid address cannot be caught.

### Visual design of the forms
| Decision | Reason | Source |
|---|---|---|
| **No pictures.** Images in web surveys shift answers towards what they show, and a photo of a road would prime its features. | Avoid a visual context effect | Couper, Tourangeau & Kenyon (2004) ◐ |
| **No colour in the answer area.** Options and buttons use ink and grey only. "Most" and "Least" look the same when chosen and are told apart by their column and label. | Colour and shading change how answer options are read | Tourangeau, Couper & Conrad (2007) ◐ |
| **Options stacked vertically, equally spaced and equally sized,** in their natural order where they have one, with "Something else" and "I'm not sure" last. In Form B, set order and item order are randomised. | The position and spacing of options are read as meaning | Tourangeau, Couper & Conrad (2004) ◐ |
| **Built for phones first.** One column, 16px or larger text (so iOS does not zoom), touch targets 44px or more, the primary button full width at the thumb, one topic per page | Readability, ease of selection, visibility | Antoun, Katz, Argueta & Wang (2018) ◐; WCAG 2.2 target size |
| **A thin progress line, with no percentage.** Progress indicators do not reliably reduce drop-out, so it is kept unobtrusive. | Avoid implying a pace | Villar, Callegaro & Yang (2013) ◐ |
| **Contrast.** All text is at least 4.5:1 against its background, in light and in dark mode. | Accessibility | WCAG 2.1 AA |

### M1. Cleaning the free lists
- **Normalisation.** Unicode NFKC, lower case, punctuation removed, Indic combining marks kept. Identical words become one key and are coded once. The same approach (merging items by their text across lists) is used in standard free-list software ◻.
- **Coding** is inductive: codes are built from the women's words (Braun & Clarke 2006 ◻).
- **Excluded entries.** An entry that is not about a road is coded "exclude" and removed. Free-list cleaning removes items outside the domain (Weller & Romney 1988 ◻).
- **Split entries.** An entry that names two or three things ("dark and empty") can be coded with up to three codes, in the order written. It then becomes that many items at consecutive positions. Without this, a coder would have to drop one of the things the woman said.
- **Repeats.** If one respondent names the same parameter twice, only its first (earliest) position is kept.
- **Uncoded entries** keep their place in the list. Coding later entries therefore never moves the positions of codes already assigned.

### M2. Smith's salience index ◐
For a respondent whose cleaned list has length L, an item at position R scores (L − R + 1) / L. Smith's S for an item is the sum of these scores over all lists, divided by N, the number of non-empty lists. Smith (1993); formula as quoted by Chaves et al. (2019).

Respondents who ticked "Nothing…" or skipped the list are not counted in N; they are reported separately. Excluding them multiplies every S by the same factor, so the order is unaffected.

### M3. Sutrop's cognitive salience index ◐
CSI = F / (N × mP), where F is the frequency and mP the mean position. Sutrop (2001). It is reported next to S as a check; the two orders should agree.

### M4. Elbow of the salience curve ◻
- **Method.** The point of greatest bend comes from the offline Kneedle method (Satopää et al. 2011). Both axes are scaled to 0–1. For a decreasing curve, the elbow is the point that maximises 1 − x − y, which is the point farthest below the chord from the first value to the last.
- **Which parameters.** It is computed on the eligible parameters only (codes marked Safety), the same set the cut-off K is applied to.
- **Role.** A scree-type cut-off is the usual rule in free-list analysis (Quinlan 2005 ◐). Here it is reported next to the fixed K (see the freeze rule) and decides nothing on its own.

### M5. Saturation ✔
- **Method.** Guest, Namey & Chen (2020).
  - **Base.** The codes found in the first 4 lists form the base; their number is the denominator, which stays fixed.
  - **Runs.** Each run of 2 lists is compared with everything before it. New information = codes in the run not seen in any earlier list ÷ the base count.
  - **Rolling.** The run moves forward one respondent at a time.
- **Threshold.** The authors' defaults: new information of 5% or less. The stricter variant (run of 3, no new codes) is also shown.
- **Notation.** Saturation is reported in the authors' notation: "7+2" means saturation was reached at respondent 7, confirmed by respondents 8 and 9. In the original worked example, saturation reached at interview 6 is written "6+2".
- **Adaptation.** The method was designed for interview themes and is applied here to free-list codes. Only coded entries count.

### M6. Inter-coder agreement (optional second coder) ✔ (example reproduced) / ◻ (thresholds)
- **Procedure.** Coder 2 codes a fixed 30% sample of entries, chosen by a hash of the entry text, without seeing Coder 1's codes, using the same codebook.
- **Statistic.** Krippendorff's α for nominal data (Krippendorff 2004; Hayes & Krippendorff 2007). The implementation reproduces Krippendorff's published two-coder example (α = 0.095).
- **Split entries.** The value of a split entry is its set of codes. Two coders agree only if they give the same set, which is strict. MASI distance (Passonneau 2006 ◻) is a gentler alternative for set-valued codes.
- **Interpretation.** α ≥ 0.80 is reliable; 0.667–0.80 supports tentative conclusions only.
- **If there is no second coder,** report it as a limitation.

### M9. Proportions ◻
Shares such as "changed a trip because of safety" are reported with Wilson score intervals (Wilson 1927). Brown, Cai & DasGupta (2001) recommend these over the Wald interval.

### Hypothesis checks reported
1. **A2.1.** The share who chose a different road, or did not use a road, for a reason other than time or distance.
2. **A3.1.** The share who did so because of how safe the road felt.
3. **The unprimed list (A2.2).** The share of lists that already name a safety parameter before safety was mentioned. This is valid only because nothing before Block 2 mentions safety; a test checks this automatically. It is marked provisional until the unprimed list is fully coded.

### From Stage 1 to Stage 2: the freeze rule
- **Rule.** The **top K parameters by Smith's S** on the safety list (A3.4) become the Form B items, with three exclusions:
  - codes the researcher marked "not safety";
  - codes listed by only one respondent, because single mentions are treated as idiosyncratic (Sutrop 2001 ◐);
  - ties broken by frequency, then mean position. A tie at the cut-off is flagged.
- **K.** K = 12, fixed in advance: 12 sets of 4, each item shown 4 times (M7).
  - **Allowed range.** 8–16. With fewer than 8 items, a set of 4 would show more than half the list, against the MaxDiff design guidance of Sawtooth Software (n.d. ✔), which advises showing no more than half of the items in any one set.
  - **Each item is shown 4 times.** That guidance asks for 3–5 times per respondent, which is at least 3K/k sets (9 for K = 12).
- **Checks before freezing.** The server refuses to freeze unless:
  - every safety-list entry is coded;
  - every item has a label and a one-line description;
  - no label or description uses a word that presupposes a threat (*fear, afraid, scared, scary, danger, threat, harass, attack, assault, risk, unsafe, crime, criminal*);
  - no label or description repeats the question's own criterion (*safe, safety*). An item must name a feature of the road; "how safe the footpath is" would restate the question.

  Words are matched at the start of a word, so "unsafe" is never read as "safe".
- **Record.** The freeze stores the rule, the time, the Form A sample size, the saturation status, the elbow rank and the exact wording shown.
- **Changing the list.** A new list needs a new design version. Earlier Form B responses stay stored but are left out of the new version's ranking.

---

## Stage 2: Form B

### Question design
- **Order.** Consent, eligibility and email, instructions with an unscored practice set, the K sets, then the travel profile (B4), then debriefing (B5). Profile questions come last, as in Form A. Earlier participation is found by email (see above), not asked.
- **One criterion.** Every set uses the identical question, with "most" and "least" in bold.
- **Tie-break instruction.** "If two items feel equally important, choose either one." The earlier "the one that comes first to mind" could be read as "the first one on the screen", which would invite position effects.
- **Practice items.** The practice set is about trip decisions (time, cost, comfort, ease of finding the route), so it cannot rehearse the study items.
- **Skipping.** Every set has "Skip this set", so the consent promise holds. A half-answered set gets a specific prompt ("Now choose the one that matters least").

### M7. Best-worst design ◻
- **Type.** Best-worst scaling, Case 1 (the object case): Finn & Louviere (1992); Louviere, Flynn & Marley (2015).
- **Construction.** A cyclic incomplete block design (John & Williams 1995). With K items there are K sets of 4: set s = initial block + s (mod K), so every item appears exactly 4 times. All initial blocks are searched, and the chosen one covers the most item pairs with the most even pair counts.
  - K = 12: all 66 pairs appear, 60 once and 6 twice.
  - K = 13: every pair exactly once (a (13, 4, 1) design).
  - Both are checked in the tests.
- **Randomisation.** Set order and item order are randomised for every respondent with a Fisher–Yates shuffle, and the displayed position is stored (M14).

### M8. Count scores ◻
For each item: B (times chosen most), W (times chosen least) and A (times shown in answered sets). The standardised score is (B − W) / A, from −1 to 1 (Louviere, Flynn & Marley 2015). It needs no model and is shown beside the model. If the model cannot be estimated yet, the ranking falls back to it and says so.

### M11. Maxdiff model (main model) ✔ (model) / ◻ (exact equation in the original)
- **Model.** P(best = b, worst = w | set S) = exp(u_b − u_w) / Σ over ordered pairs i ≠ j in S of exp(u_i − u_j). This is the maxdiff model of Marley & Louviere (2005): a conditional logit (McFadden 1974 ◻) over the 12 possible best-worst pairs of a 4-item set.
- **Estimation.** Maximum likelihood by Newton–Raphson with step-halving. The log-likelihood is concave, so the maximum is unique when it exists.
- **Identification.** The last item is fixed at 0; reported utilities are centred at 0.
- **Standard errors.** Cluster-robust (sandwich) by respondent, because each woman answers K sets (Huber 1967; White 1980; Cameron & Miller 2015 ◻), with the small-sample factor G/(G − 1).
- **Fit.** Log-likelihood against random choice, and McFadden's ρ² = 1 − LL / LL₀.
- **When it is not estimable** (an item always or never chosen, or a singular information matrix), the model is reported as not estimable instead of returning numbers.
- **Checks.**
  - The analytic gradient and Hessian match finite differences.
  - A two-item case matches the closed-form logit.
  - Simulated utilities are recovered within 4 standard errors.
  - An independent Python fit agrees to about 10⁻⁶.

### M11b. Sequential best-then-worst model (robustness) ◐
- **Model.** P = exp(u_b) / Σ_S exp(u_i) × exp(−u_w) / Σ_{S∖b} exp(−u_j). The best item is chosen from the set, then the worst from the items left (the sequential model in Marley & Louviere 2005).
- **Why it is reported.** Dyachenko, Reczek & Allenby (2014) found that respondents often answer best-worst tasks in two steps, which the maxdiff model does not assume.
- **How it is reported.** It is fitted to the same choices, and its order is compared with the main model's by Spearman's ρ. The analytic derivatives are tested, and an independent Python fit agrees.

### Weights for the routing algorithm
- **Formula.** Weight_i = exp(u_i) / Σ exp(u_k). Under the logit model, exp(u) is on a ratio scale (Luce 1959 ◻), so the weights can be read as relative importance; they sum to 1. Under the best-choice part of the model, a weight is the probability of an item being chosen as the most important from the full list.
- **Limit.** The weights depend on the model's error scale, so their spread is not unique. The **order** is the most robust result. Report the order with its intervals, and treat the weights as the model-based version of that order.

### M12. Uncertainty ◻
- **Simulation.** 2,000 draws from N(β̂, V_robust) (Krinsky & Robb 1986) give each item a 95% interval for its weight, a 95% interval for its rank, and the probability of being ranked first.
- **Rank intervals** use the discrete (type 1) quantile, so they are always whole ranks ("2–4", never "2.475–4").
- **Reproducibility.** A fixed seed means the same data always gives the same intervals.
- **Calibration in simulation** (`dev/power.js`): the 95% weight intervals contained the true weight in 93–95% of samples, close to nominal. The rank intervals are conservative (99–100%).
- **Reading.** Items with overlapping intervals should not be called different.

### M10. Agreement between orderings ◻
Spearman's ρ (the Pearson correlation of ranks, with ties given their average rank). It is used for counts against the model, the sequential model against the main model, and the main ranking against the ranking without flagged respondents.

### M13. Data quality ✔
- **Speed index.** The relative speed index (Leiner 2019, p. 237):
  - for each page, the sample's median page time ÷ the respondent's time on that page gives a speed factor;
  - each factor is **clipped at 3**, so that a respondent who skips a single page by accident is not disqualified;
  - the index is the mean over the pages she saw.

  Leiner's pragmatic cut-off of **2.0** flags particularly suspicious records. Leiner also warns that completion time is not a valid indicator for questions about facts rather than opinions. For Form A it is therefore reported but never used to drop anyone.
- **Left out of the Form B ranking, and counted** (see the email section): a repeat from the same email, and a woman whose email is in Form A. These are rules of the design, not sensitivity checks.
- **Sensitivity analysis.** Respondents flagged for speed **stay in** the main ranking. The model is re-run without them and the agreement is reported.
- **Test responses.** Responses sent with `?test=1` are stored but never analysed. The analytics page can include test responses on request, to check that the forms reach the analysis; it then says so in a banner, and the freeze always runs on real responses only.
- **Respondents tab.** Every stored response is listed by email with the reason it is in or out of the analysis, and its answers can be opened. A withdrawal request is carried out there: every response from that email is deleted.

### M14. Position check ◻ (test) / ✔ (calibrated here)
- **What is counted.** Choices of most and least by screen position. With randomised order, each position should be chosen about equally often.
- **Test.** A Pearson chi-square test of equal spread (3 df) for best and for worst. The p-value uses the regularised incomplete gamma function (Press et al., *Numerical Recipes*), and matches SciPy and the standard critical values.
- **Calibration.** Under no position effect, p < 0.05 occurred in 5.0% (best) and 4.95% (worst) of 2,000 simulated samples of 60 respondents.
- **Caveat.** Choices are not strictly independent within a respondent, so a small p-value is a prompt to look, not proof.

### Quantiles ✔
Sample quantiles use Hyndman & Fan (1996) type 7 (the default in R and NumPy), and type 1 for ranks. The test values match NumPy's implementations of the same definitions (`linear` and `inverted_cdf`); R itself was not run.

---

## Data storage and security

**Where the data is.**
- **The answers** are kept in a private Vercel Blob store, `thesis-responses`, in Vercel's Mumbai region (bom1), the same region as the backend function. Each response is one JSON file, written once and never overwritten.
- **The settings** (codebook, coding, freeze and its history) are one file, `state.json`.
- **The backend** is a Vercel function (`api/index.js`). It is the only thing that reads or writes the store.
- **The store's credentials** are issued and rotated by Vercel (OIDC), or are the store's own token, which Vercel adds to the project's encrypted settings when the store is connected. No credential is in the code, in the repository or in a browser.

**Who can read it.** The researcher actions (results, coding, freeze, export, withdrawal) work only when the request:
- arrives on one of the project's private Vercel addresses. Vercel Deployment Protection (Standard Protection, on by default) lets only the owner's Vercel account open those addresses;
- comes from a page on that same address. The browser's Origin header is checked, so another website cannot send the request using the researcher's session;
- finds Vercel's protection switched on. The function checks this itself by asking its own private address for a page without credentials. If the check fails, or cannot be made, access is refused (fail closed).

The public address never opens results. There is no shared password to leak or guess.

**Integrity.**
- **Answers are re-checked on the server.** The server never trusts the browser: it checks eligibility, the email format, allowed values, lengths and the Form B design.
- **Each response is created once.** A resubmission with the same ID is recognised as a duplicate.
- **Settings changes are conditional writes.** A change made from out-of-date settings is refused, by an ETag check, rather than overwriting a newer one.
- **The freeze records exactly what each Form B version showed**, kept in `state.json` with the time and the rule.

**Free-plan allowance.** On Vercel's free plan the store allows 2,000 uploads and listings and 10,000 uncached reads a month. It is locked for 30 days if they are exceeded. The backend is designed to stay well inside this, and a test counts the operations:
- each analysis lists the store once (reused for 20 seconds);
- each response is downloaded only once;
- form pages read the settings through the cache;
- the analytics page does not refresh itself.

**Pages.**
- **Respondent text is shown as text, never as HTML.**
- **A strict Content Security Policy** lets the pages run only their own scripts and connect only to their own site.
- **The pages cannot be framed** by another site.

**Retention.**
- **When a woman withdraws,** her files are deleted at once.
- **When the study ends,** the shareable, pseudonymised export is kept and the store is deleted, as the consent says.

**Checked by.**
- **Locally.** The storage code is tested against a stand-in for the Vercel Blob SDK (`test/blob-fake.js`) that follows its documented behaviour (no overwrite without permission, ETag preconditions, paging) and counts billed operations.
- **On the live site (5 November 2026).** A test response submitted at the public address was saved, read back at the private address and deleted by the withdrawal action. Results were refused at the public address, with a forged forwarding header, and without a matching Origin. A forged Host header was sent to Vercel's sign-in page.
- **The alternative GitHub storage** (`backend/store-github.js`, used only if a GitHub token is configured) is tested against a stand-in GitHub API backed by a real git repository.

## What the simulations show (simulated data, not results)

**End to end** (`npm run simulate`). 40 synthetic Form A and 60 synthetic Form B respondents with known "true" utilities go through the real backend, including coding (with split entries), the freeze and the live ranking.
- The live ranking recovered the true order with Spearman ρ = 0.99 (0.993 in the run of 5 November 2026; the value depends on the random draws).
- The only swaps were between neighbouring items whose 95% intervals overlapped.

**Sample size** (`npm run power`). This follows the simulation approach to sample size for choice experiments (de Bekker-Grob, Donkers, Jonker & Stolk 2015 ◻). There were 200 simulated samples per size, with 12 items and assumed utilities spread over about 2 logits.

| Form B respondents | ρ with the true order: median (5th percentile) | true top item ranked 1st | true top 3 found | 95% weight interval holds the truth | median width of the 95% rank interval |
|---|---|---|---|---|---|
| 30 | 0.972 (0.944) | 84% | 89% | 93.6% | 3 ranks |
| 50 | 0.986 (0.965) | 91% | 95% | 93.4% | 2 ranks |
| 80 | 0.993 (0.972) | 95% | 98% | 94.6% | 2 ranks |
| 120 | 0.993 (0.979) | 99% | 99% | 94.8% | 1 rank |

- **Reading.** At the planned 50 respondents, the top and bottom of the order are clear, and neighbouring items in the middle will often overlap; report them as tied. If the real utilities are closer together than assumed, more respondents are needed.
- **Planned size.** The ranking page marks results "provisional" until the planned sample (`plannedSampleB` in `config.js`, 50 by default) is reached.

---

## What a reviewer may ask, and the honest answer

| Question | Answer to give |
|---|---|
| Why no Delphi panel? | The parameters come from the target population through free listing, and are ranked by that population. No expert panel decides what matters to women. |
| Was the wording pre-tested? | Not through cognitive interviews; the researcher chose not to run them. Respondent-debriefing questions are built into both forms (Presser et al. 2004). This is weaker than cognitive interviewing and should be stated as a limitation. |
| Isn't the "unprimed" list primed by the consent? | No. Nothing before Block 2, the consent included, names safety or a threat (checked by a test). This rests on incomplete disclosure approved by the ethics committee, with a debrief. |
| Was coding reliable? | Report Krippendorff's α if a second coder was used. If not, state it as a limitation. |
| What about answers naming two things? | They are split into up to three codes, in the order written (M1). |
| Is the sample representative? | No. It is a self-selected, non-probability sample of English-reading women online. Report the sample profile tables. |
| Why K = 12? | Fixed in advance so that every item appears equally often in a balanced design within the usual MaxDiff guidance. Report the elbow rank and any tie at the cut-off. |
| Does the model drive the result? | The order is reported with a model-free count score and a second model (sequential best-worst); their agreement is shown. |
| Are the weights exact? | No. The order with 95% intervals is the result; the weights are a model-based scale of that order. |
| Did respondents choose by position? | Item order is randomised, and choices by position are reported with a calibrated test. |
| Why collect email addresses? | To count each woman once, to keep the Form B sample separate from Form A, and to allow withdrawal. They are kept apart from the answers and never reported. The cost (confidential rather than anonymous answers) is stated as a limitation. |
| Were the Form B women really different from the Form A women? | Every Form B response whose email matches a Form A response is left out of the ranking, and the number is reported. Someone using a different address would not be caught. |
| Why so few questions? | Each question that remains feeds a reported result. Those that only described coping actions, or repeated another question, were removed (see "What was cut, and why"). |

## Limitations to state
- There were no cognitive interviews; debriefing questions are a weaker check of wording.
- The design relies on incomplete disclosure (safety named only in Block 2), which needs ethics approval.
- Answers are confidential, not anonymous, because an email is required. This can lower reporting on sensitive topics (Tourangeau & Yan 2007), and some women may decline to take part for this reason.
- The email match finds repeats and Form A respondents only when the same address is used.
- One coder, unless a second is used.
- Free-list salience depends on how respondents phrase things, and on the coder's grouping.
- The sample is self-selected, online and in English only. A translated version would need forward and back translation.
- The weights depend on the model; the order is the robust result.
- The sample sizes are modest, so neighbouring items in the middle of the order will often be indistinguishable.

## Full references
- Antoun, C., Katz, J., Argueta, J., & Wang, L. (2018). Design heuristics for effective smartphone questionnaires. *Social Science Computer Review*, 36(5), 557–574.
- Braun, V., & Clarke, V. (2006). Using thematic analysis in psychology. *Qualitative Research in Psychology*, 3(2), 77–101.
- Brown, L. D., Cai, T. T., & DasGupta, A. (2001). Interval estimation for a binomial proportion. *Statistical Science*, 16(2), 101–133.
- Cameron, A. C., & Miller, D. L. (2015). A practitioner's guide to cluster-robust inference. *Journal of Human Resources*, 50(2), 317–372.
- Chaves, L. da S., et al. (2019). What matters in free listing? A probabilistic interpretation of the salience index. *Acta Botanica Brasilica*, 33(2). (Quoted for Smith's formula; pages not checked.)
- Couper, M. P., Tourangeau, R., & Kenyon, K. (2004). Picture this! Exploring visual effects in web surveys. *Public Opinion Quarterly*, 68(2), 255–266.
- de Bekker-Grob, E. W., Donkers, B., Jonker, M. F., & Stolk, E. A. (2015). Sample size requirements for discrete-choice experiments in healthcare: A practical guide. *The Patient*, 8(5), 373–384.
- Décieux, J. P., Mergener, A., Neufang, K. M., & Sischka, P. (2015). Implementation of the forced answering option within online surveys: Do higher item response rates come at the expense of participation and answer quality? *Psihologija*, 48(4), 311–326.
- Dillman, D. A., Smyth, J. D., & Christian, L. M. (2014). *Internet, Phone, Mail, and Mixed-Mode Surveys: The Tailored Design Method* (4th ed.). Wiley.
- Dyachenko, T., Reczek, R. W., & Allenby, G. M. (2014). Models of sequential evaluation in best-worst choice tasks. *Marketing Science*, 33(6), 828–848.
- Finn, A., & Louviere, J. J. (1992). Determining the appropriate response to evidence of public concern: The case of food safety. *Journal of Public Policy & Marketing*, 11(2), 12–25.
- Flanagan, J. C. (1954). The critical incident technique. *Psychological Bulletin*, 51(4), 327–358.
- Guest, G., Namey, E., & Chen, M. (2020). A simple method to assess and report thematic saturation in qualitative research. *PLOS ONE*, 15(5), e0232076.
- Hayes, A. F., & Krippendorff, K. (2007). Answering the call for a standard reliability measure for coding data. *Communication Methods and Measures*, 1(1), 77–89.
- Huber, P. J. (1967). The behavior of maximum likelihood estimates under nonstandard conditions. *Proceedings of the Fifth Berkeley Symposium*, 1, 221–233.
- Hyndman, R. J., & Fan, Y. (1996). Sample quantiles in statistical packages. *The American Statistician*, 50(4), 361–365.
- Indian Council of Medical Research (2017). *National Ethical Guidelines for Biomedical and Health Research Involving Human Participants*. ICMR.
- John, J. A., & Williams, E. R. (1995). *Cyclic and Computer Generated Designs* (2nd ed.). Chapman & Hall.
- Keusch, F. (2014). The influence of answer box format on response behavior on list-style open-ended questions. *Journal of Survey Statistics and Methodology*, 2(3), 305–322.
- Krinsky, I., & Robb, A. L. (1986). On approximating the statistical properties of elasticities. *Review of Economics and Statistics*, 68(4), 715–719.
- Krippendorff, K. (2004). *Content Analysis: An Introduction to Its Methodology* (2nd ed.). Sage.
- Krosnick, J. A., & Presser, S. (2010). Question and questionnaire design. In P. V. Marsden & J. D. Wright (Eds.), *Handbook of Survey Research* (2nd ed.). Emerald.
- Leiner, D. J. (2019). Too fast, too straight, too weird: Non-reactive indicators for meaningless data in internet surveys. *Survey Research Methods*, 13(3), 229–248.
- Louviere, J. J., Flynn, T. N., & Marley, A. A. J. (2015). *Best-Worst Scaling: Theory, Methods and Applications*. Cambridge University Press.
- Luce, R. D. (1959). *Individual Choice Behavior*. Wiley.
- Marley, A. A. J., & Louviere, J. J. (2005). Some probabilistic models of best, worst, and best–worst choices. *Journal of Mathematical Psychology*, 49(6), 464–480.
- McFadden, D. (1974). Conditional logit analysis of qualitative choice behavior. In P. Zarembka (Ed.), *Frontiers in Econometrics*. Academic Press.
- Passonneau, R. (2006). Measuring agreement on set-valued items (MASI) for semantic and pragmatic annotation. *Proceedings of LREC 2006*.
- Presser, S., Couper, M. P., Lessler, J. T., Martin, E., Martin, J., Rothgeb, J. M., & Singer, E. (2004). Methods for testing and evaluating survey questions. *Public Opinion Quarterly*, 68(1), 109–130.
- Press, W. H., Teukolsky, S. A., Vetterling, W. T., & Flannery, B. P. (2007). *Numerical Recipes* (3rd ed.). Cambridge University Press.
- Quinlan, M. (2005). Considerations for collecting freelists in the field: Examples from ethnobotany. *Field Methods*, 17(3), 219–234.
- Satopää, V., Albrecht, J., Irwin, D., & Raghavan, B. (2011). Finding a "kneedle" in a haystack: Detecting knee points in system behavior. *31st International Conference on Distributed Computing Systems Workshops*, 166–171.
- Sawtooth Software (n.d.). *Lighthouse Studio manual: Designing a MaxDiff study*. sawtoothsoftware.com/help/lighthouse-studio/manual/maxdiff-designing-study.html (retrieved 5 November 2026).
- Klensin, J. (2008). *Simple Mail Transfer Protocol* (RFC 5321). Internet Engineering Task Force. (Path limit of 256 octets, so at most 254 characters for the address.)
- Schaeffer, N. C., & Presser, S. (2003). The science of asking questions. *Annual Review of Sociology*, 29, 65–88.
- Schuman, H., & Presser, S. (1981). *Questions and Answers in Attitude Surveys: Experiments on Question Form, Wording, and Context*. Academic Press.
- Smith, J. J. (1993). Using ANTHOPAC 3.5 and a spreadsheet to compute a free-list salience index. *Cultural Anthropology Methods*, 5(3), 1–3.
- Sutrop, U. (2001). List task and a cognitive salience index. *Field Methods*, 13(3), 263–276.
- Tourangeau, R., Couper, M. P., & Conrad, F. (2004). Spacing, position, and order: Interpretive heuristics for visual features of survey questions. *Public Opinion Quarterly*, 68(3), 368–393.
- Tourangeau, R., Couper, M. P., & Conrad, F. (2007). Color, labels, and interpretive heuristics for response scales. *Public Opinion Quarterly*, 71(1), 91–112.
- Tourangeau, R., Rips, L. J., & Rasinski, K. (2000). *The Psychology of Survey Response*. Cambridge University Press.
- Tourangeau, R., & Yan, T. (2007). Sensitive questions in surveys. *Psychological Bulletin*, 133(5), 859–883.
- Villar, A., Callegaro, M., & Yang, Y. (2013). Where am I? A meta-analysis of experiments on the effects of progress indicators for web surveys. *Social Science Computer Review*, 31(6), 744–762.
- Weller, S. C., & Romney, A. K. (1988). *Systematic Data Collection*. Sage.
- White, H. (1980). A heteroskedasticity-consistent covariance matrix estimator and a direct test for heteroskedasticity. *Econometrica*, 48(4), 817–838.
- Wilson, E. B. (1927). Probable inference, the law of succession, and statistical inference. *Journal of the American Statistical Association*, 22(158), 209–212.
