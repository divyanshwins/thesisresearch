/*
 * questions.js: the exact wording of Form A and Form B, in one place.
 * Wording follows Women_Road_Choice_Questionnaire.md. Answer values must
 * match Engine.OPTIONS in backend/Engine.gs, and field ids must match the
 * fields Engine.validateA / validateB store (test/forms.test.js checks both).
 * **Double asterisks** mark the few words shown in bold.
 */
(function () {
  'use strict';

  var O = {
    consent: [{ v: 'yes', label: 'I agree' }, { v: 'no', label: 'I do not agree', end: true }],
    gender: [
      { v: 'woman', label: 'Woman' },
      { v: 'man', label: 'Man', end: true },
      { v: 'nonbinary', label: 'Non-binary or another identity', end: true },
      { v: 'prefer_not', label: 'Prefer not to say', end: true }
    ],
    age: [
      { v: 'under18', label: 'Under 18', end: true },
      { v: '18_24', label: '18–24' }, { v: '25_34', label: '25–34' }, { v: '35_44', label: '35–44' },
      { v: '45_54', label: '45–54' }, { v: '55_plus', label: '55 or above' }
    ],
    roads: [{ v: 'yes', label: 'Yes' }, { v: 'no', label: 'No', end: true }],
    modes: [
      { v: 'foot', label: 'On foot' }, { v: 'bicycle', label: 'Bicycle' }, { v: 'twowheeler', label: 'Scooter or motorbike' },
      { v: 'car', label: 'Car' }, { v: 'auto_taxi', label: 'Auto, taxi or ride-hailing' }, { v: 'bus', label: 'Bus' },
      { v: 'train_metro', label: 'Train or metro (including the road to and from the station)' },
      { v: 'other', label: 'Something else', other: 'modesOther' }
    ],
    company: [{ v: 'alone', label: 'Usually alone' }, { v: 'others', label: 'Usually with other people' }, { v: 'both', label: 'About equally both' }],
    area: [
      { v: 'dense_city', label: 'Dense city area' }, { v: 'residential', label: 'Residential neighbourhood' },
      { v: 'campus', label: 'Campus or institutional area' }, { v: 'commercial', label: 'Commercial or industrial area' },
      { v: 'periurban', label: 'Outskirts or semi-rural' }, { v: 'rural', label: 'Rural' }, { v: 'varies', label: 'It varies a lot' }
    ],
    yesNoUnsure: [{ v: 'yes', label: 'Yes' }, { v: 'no', label: 'No' }, { v: 'not_sure', label: "I'm not sure" }],
    // in the order of the day
    timeOfDay: [{ v: 'day', label: 'Daytime' }, { v: 'dawn_dusk', label: 'Around dawn or dusk' }, { v: 'dark', label: 'After dark' }, { v: 'dont_remember', label: "I don't remember", fixed: true }]
  };

  var END_TEXT = 'Thank you for your interest. This survey is for women aged 18 or over who use public roads, so there are no more questions for you. Nothing you entered has been saved.';
  var END_CONSENT = 'Thank you. You chose not to take part, so nothing has been saved.';

  // Shared consent paragraphs. Form A names its topic without the word "safety",
  // so that Block 1 is unprimed; safety is disclosed at the start of Block 2 and
  // the reason is explained in the debrief (incomplete disclosure: needs ethics approval).
  var VOLUNTARY = 'Taking part is voluntary. Apart from your email address and three short questions about who the survey is for, you can skip any question. You can stop at any time by closing this page. Nothing is sent until you press Submit at the end.';
  // Responses are confidential, not anonymous: the email identifies the person, so the text says who sees it,
  // what it is for, that it is deleted, and how to withdraw.
  var IDENTITY = 'We ask for your email address so that we know who has taken part and no one is counted twice. Your name is optional. Only the researcher sees these details. They never appear in any report, are never shared, and are deleted when the study ends. To have your answers removed, write to the study contact before the results are published, giving the email address you used.';
  var USE = 'Your answers are used only for research and are reported as group results. Short quotations from what you write may be used, without anything that could identify you. Please do not write other people’s names or exact addresses.';
  var DEVICE = 'Your answers are kept on this device until you submit, so that reloading the page does not lose them.';
  var CONSENT_A = ['This study is about how women choose which roads to use in everyday travel. It takes about 5 minutes.', VOLUNTARY, IDENTITY, USE, DEVICE];
  var CONSENT_B = ['This study is about what matters to women when they decide whether a road is safe enough to use. It takes about 7 minutes.', VOLUNTARY, IDENTITY, USE, DEVICE];

  function consentPage(paragraphs) {
    return { id: 'consent', title: 'Information and consent', questions: [
      { type: 'info', paragraphs: paragraphs, studyInfo: true },
      { type: 'single', id: 'consent', prompt: 'Having read this, do you agree to take part?', options: O.consent, required: true, endText: END_CONSENT }
    ] };
  }
  // The email comes after the three screening questions, so that no one who is screened out is asked for it.
  function eligibilityPage(prefix) {
    return { id: 'elig', title: 'About you', questions: [
      { type: 'single', id: 'gender', code: prefix + '1.1', prompt: 'Which of these describes you?', options: O.gender, required: true, endText: END_TEXT },
      { type: 'single', id: 'age', code: prefix + '1.2', prompt: 'Which age group are you in?', options: O.age, required: true, endText: END_TEXT },
      { type: 'single', id: 'roads', code: prefix + '1.3', prompt: 'In the last 12 months, have you used public roads to get somewhere, for example on foot, by bicycle, scooter, car, auto or taxi, or to reach a bus or train?', options: O.roads, required: true, endText: END_TEXT },
      { type: 'email', id: 'email', code: prefix + '1.4', prompt: 'Your email address', help: 'Only the researcher sees it. It is never shared.', required: true, requiredText: 'Please enter your email address to continue.' },
      { type: 'text', id: 'name', code: prefix + '1.5', prompt: 'Your name', optionalLabel: true, quiet: true, autocomplete: 'name' }
    ] };
  }
  // Asked last in both forms: demographic questions go at the end (Dillman, Smyth & Christian 2014),
  // and "alone or with others" must not cue safety before the unprimed list.
  function travelPage(prefix) {
    return { id: 'travel', title: 'About your travel', intro: 'Last, a few questions about how you travel. They describe who took part.', questions: [
      { type: 'multi', id: 'modes', code: prefix + '.1', prompt: 'How do you usually travel on public roads?', help: 'Select all that apply.', options: O.modes },
      { type: 'single', id: 'company', code: prefix + '.2', prompt: 'When you travel, are you usually alone, with other people, or both?', options: O.company },
      { type: 'single', id: 'area', code: prefix + '.3', prompt: 'Which best describes the area where you travel most?', options: O.area },
      { type: 'text', id: 'city', code: prefix + '.4', prompt: 'Which city or town do you travel in most?', optionalLabel: true, quiet: true }
    ] };
  }
  var LIST_HELP = 'Write one thing per box, in the order they come to mind. Use as many or as few boxes as you like.';

  var formA = {
    id: 'A',
    title: 'How women choose roads',
    pages: [
      consentPage(CONSENT_A),
      eligibilityPage('A'),
      // Block 1 (A2): no safety words anywhere before Block 2. The episode question is a recall cue for the list
      // below it and gives the first premise check; the list is the unprimed data.
      { id: 'list', title: 'Choosing a road', note: 'After this page the survey moves on to new questions, and you will not be able to come back to this page.', questions: [
        { type: 'single', id: 'changedAny', code: 'A2.1', prompt: 'In the last 12 months, was there a time when you chose a different road from the one you would usually take, or decided not to use a road, for a reason other than how long it takes or how far it is?', options: O.yesNoUnsure },
        { type: 'freelist', id: 'listAny', code: 'A2.2', nothingId: 'listAnyNothing', nothingLabel: 'Nothing about a road changes my choice',
          prompt: 'List things about a road that can change whether you choose to use it.', help: LIST_HELP }
      ] },
      // Block 2 (A3): safety. Back is locked so Block 1 answers stay as first given (funnel order).
      // A3.1 has the same form as A2.1 with safety as the reason, so the two shares can be compared.
      { id: 'safety', title: 'Roads and safety', lockBack: true,
        intro: 'The next questions are about how safe roads feel to you. They do not ask you to describe any incident. You can skip any question.',
        questions: [
          { type: 'single', id: 'changedSafety', code: 'A3.1', prompt: 'In the last 12 months, was there a time when how safe or unsafe a road felt to you made you choose a different road, or decide not to use a road?', options: O.yesNoUnsure }
        ] },
      { id: 'safetyStory', title: 'Roads and safety', showIf: function (a) { return a.changedSafety === 'yes'; }, questions: [
        { type: 'text', id: 'storySafety', code: 'A3.2', long: true, optionalLabel: true, quiet: true, prompt: 'Think of the most recent time. Without naming the road or the place, describe what it was about the road that affected how safe it felt.' },
        { type: 'single', id: 'timeSafety', code: 'A3.3', prompt: 'Was it daytime or after dark?', options: O.timeOfDay }
      ] },
      { id: 'safetyList', title: 'Roads and safety', questions: [
        { type: 'freelist', id: 'listSafety', code: 'A3.4', nothingId: 'listSafetyNothing', nothingLabel: 'Nothing about a road changes how safe it feels to me',
          prompt: 'List things about a road that can make it feel more safe or less safe to you.', help: LIST_HELP }
      ] },
      travelPage('A4'),
      { id: 'debrief', title: 'One last question', questions: [
        { type: 'text', id: 'unclear', code: 'A5.1', long: true, optionalLabel: true, quiet: true, prompt: 'Was any question in this survey unclear or hard to answer? If so, which one, and why?' }
      ] }
    ],
    // shown after a successful submit (debriefing for the incomplete disclosure in the consent)
    debrief: 'Why the questions came in this order: the first questions did not mention safety, so that your first list shows what comes to mind on its own. The later questions then asked about safety directly. Comparing the two lists is part of the study.'
  };

  var formB = {
    id: 'B',
    title: 'What matters when choosing a road',
    consent: consentPage(CONSENT_B),
    eligibility: eligibilityPage('B'),
    instructions: [
      'You will see {n} sets of 4 items. In each set, choose the one that matters **most** and the one that matters **least** when you decide whether a road is safe enough for you to use.',
      'There are no right or wrong answers. If two items feel equally important, choose either one.',
      'First, one example to try. It is not counted.'
    ],
    practice: {
      stem: 'Which one matters **most**, and which one matters **least**, when you decide how to make a trip?',
      items: [
        { label: 'How long the trip takes', description: '' }, { label: 'How much the trip costs', description: '' },
        { label: 'How comfortable the trip is', description: '' }, { label: 'How easy the route is to find', description: '' }
      ]
    },
    stem: 'Thinking about whether a road is safe enough for you to use: which one of these matters **most** to your decision, and which one matters **least**?',
    // Earlier participation is found by matching the email with Form A, not asked.
    travel: travelPage('B4'),
    debrief: { id: 'debrief', title: 'Last questions', questions: [
      { type: 'text', id: 'unclearItems', code: 'B5.1', long: true, optionalLabel: true, quiet: true, prompt: 'Was any item unclear? If so, which one, and why?' },
      { type: 'text', id: 'missingItems', code: 'B5.2', long: true, optionalLabel: true, quiet: true, prompt: 'Is anything missing that matters to you when you decide whether a road is safe enough to use?' }
    ] }
  };

  var closing = 'Thank you for taking part. Your answers have been saved.';

  var root = typeof window !== 'undefined' ? window : globalThis;
  root.QUESTIONS = { options: O, formA: formA, formB: formB, closing: closing };
})();
