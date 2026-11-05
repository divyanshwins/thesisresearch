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
    frequency: [{ v: 'daily', label: 'Every day' }, { v: 'few_week', label: 'A few times a week' }, { v: 'few_month', label: 'A few times a month' }, { v: 'less', label: 'Less often' }],
    company: [{ v: 'alone', label: 'Usually alone' }, { v: 'others', label: 'Usually with other people' }, { v: 'both', label: 'About equally both' }],
    area: [
      { v: 'dense_city', label: 'Dense city area' }, { v: 'residential', label: 'Residential neighbourhood' },
      { v: 'campus', label: 'Campus or institutional area' }, { v: 'commercial', label: 'Commercial or industrial area' },
      { v: 'periurban', label: 'Outskirts or semi-rural' }, { v: 'rural', label: 'Rural' }, { v: 'varies', label: 'It varies a lot' }
    ],
    yesNoUnsure: [{ v: 'yes', label: 'Yes' }, { v: 'no', label: 'No' }, { v: 'not_sure', label: "I'm not sure" }],
    // every option is a change to the trip, because the filter question asked about a change
    actions: [
      { v: 'other_road', label: 'I used a different road' }, { v: 'other_transport', label: 'I used a different type of transport' },
      { v: 'with_someone', label: 'I went with someone' }, { v: 'other_time', label: 'I went at a different time' },
      { v: 'no_trip', label: 'I did not make the trip' },
      { v: 'other', label: 'Something else', other: null, fixed: true }
    ],
    // in the order of the day
    timeOfDay: [{ v: 'day', label: 'Daytime' }, { v: 'dawn_dusk', label: 'Around dawn or dusk' }, { v: 'dark', label: 'After dark' }, { v: 'dont_remember', label: "I don't remember", fixed: true }]
  };
  function actions(otherId) {
    return O.actions.map(function (o) { return o.v === 'other' ? { v: o.v, label: o.label, other: otherId, fixed: true } : o; });
  }

  var END_TEXT = 'Thank you for your interest. This survey is for women aged 18 or over who use public roads, so there are no more questions for you. Nothing you entered has been saved.';
  var END_CONSENT = 'Thank you. You chose not to take part, so nothing has been saved.';

  // Shared consent paragraphs. Form A names its topic without the word "safety",
  // so that Block 1 is unprimed; safety is disclosed at the start of Block 2 and
  // the reason is explained in the debrief (incomplete disclosure: needs ethics approval).
  var VOLUNTARY = 'Taking part is voluntary. You can skip any question, and you can stop at any time by closing this page. Nothing is sent until you press Submit at the end.';
  var PRIVACY = 'We do not ask for your name or contact details. Please do not write the names of people or exact addresses in your answers. Answers are used only for research and reported only as group results.';
  var DEVICE = 'Your answers are kept on this device until you submit, so that reloading the page does not lose them.';
  var CONSENT_A = ['This study is about how women choose which roads to use in everyday travel. It takes about 6 minutes.', VOLUNTARY, PRIVACY, DEVICE];
  var CONSENT_B = ['This study is about what matters to women when they decide whether a road is safe enough to use. It takes about 8 minutes.', VOLUNTARY, PRIVACY, DEVICE];

  function consentPage(paragraphs) {
    return { id: 'consent', title: 'Before you start', questions: [
      { type: 'info', paragraphs: paragraphs, studyInfo: true },
      { type: 'single', id: 'consent', prompt: 'Do you agree to take part?', options: O.consent, required: true, endText: END_CONSENT }
    ] };
  }
  function eligibilityPage(prefix) {
    return { id: 'elig', title: 'About you', questions: [
      { type: 'single', id: 'gender', code: prefix + '1.1', prompt: 'Which of these describes you?', options: O.gender, required: true, endText: END_TEXT },
      { type: 'single', id: 'age', code: prefix + '1.2', prompt: 'Which age group are you in?', options: O.age, required: true, endText: END_TEXT },
      { type: 'single', id: 'roads', code: prefix + '1.3', prompt: 'In the last 12 months, have you used public roads to get somewhere, for example on foot, by bicycle, scooter, car, auto or taxi, or to reach a bus or train?', options: O.roads, required: true, endText: END_TEXT }
    ] };
  }
  // Asked last in both forms: demographic questions go at the end (Dillman, Smyth & Christian 2014),
  // and "alone or with others" must not cue safety before the unprimed list.
  function travelPage(prefix, extra) {
    return { id: 'travel', title: 'About your travel', intro: 'Last, a few questions about how you travel. They describe who took part.', questions: [
      { type: 'multi', id: 'modes', code: prefix + '.1', prompt: 'How do you usually travel on public roads?', help: 'Select all that apply.', options: O.modes },
      { type: 'single', id: 'frequency', code: prefix + '.2', prompt: 'How often do you travel on public roads?', options: O.frequency },
      { type: 'single', id: 'company', code: prefix + '.3', prompt: 'When you travel, are you usually alone, with other people, or both?', options: O.company },
      { type: 'single', id: 'area', code: prefix + '.4', prompt: 'Which best describes the area where you travel most?', options: O.area },
      { type: 'text', id: 'city', code: prefix + '.5', prompt: 'Which city or town do you travel in most?', optionalLabel: true, quiet: true }
    ].concat(extra || []) };
  }
  var LIST_HELP = 'Write one thing per box, in the order they come to mind. Use as many or as few boxes as you like.';

  var formA = {
    id: 'A',
    title: 'How women choose roads',
    pages: [
      consentPage(CONSENT_A),
      eligibilityPage('A'),
      // Block 1 (A2): no safety words anywhere before Block 2
      { id: 'change', title: 'Choosing a road', questions: [
        { type: 'single', id: 'changedAny', code: 'A2.1', prompt: 'In the last 12 months, was there a time when you chose a different road from the one you would usually take, or decided not to use a road, for a reason other than how long it takes or how far it is?', options: O.yesNoUnsure }
      ] },
      { id: 'changeStory', title: 'Choosing a road', showIf: function (a) { return a.changedAny === 'yes'; }, questions: [
        { type: 'text', id: 'storyAny', code: 'A2.2', long: true, optionalLabel: true, quiet: true, prompt: 'Think of the most recent time. Without naming the road or the place, describe what the road was like and what made you choose differently.' },
        { type: 'multi', id: 'actionsAny', code: 'A2.3', prompt: 'What did you do?', help: 'Select all that apply.', options: actions('actionsAnyOther'), randomize: 'actions' }
      ] },
      { id: 'list', title: 'Choosing a road', note: 'After this page the survey moves on to new questions, and you will not be able to come back to this page.', questions: [
        { type: 'freelist', id: 'listAny', code: 'A2.4', nothingId: 'listAnyNothing', nothingLabel: 'Nothing about a road changes my choice',
          prompt: 'List things about a road that can change whether you choose to use it.', help: LIST_HELP }
      ] },
      // Block 2 (A3): safety. Back is locked so Block 1 answers stay as first given (funnel order).
      { id: 'safety', title: 'Roads and safety', lockBack: true,
        intro: 'The next questions are about how safe roads feel to you. They do not ask you to describe any incident. You can skip any question.',
        questions: [
          { type: 'single', id: 'changedSafety', code: 'A3.1', prompt: 'In the last 12 months, did how safe or unsafe a road felt to you ever change how you made a trip, or whether you went at all?', options: O.yesNoUnsure }
        ] },
      { id: 'safetyStory', title: 'Roads and safety', showIf: function (a) { return a.changedSafety === 'yes'; }, questions: [
        { type: 'text', id: 'storySafety', code: 'A3.2', long: true, optionalLabel: true, quiet: true, prompt: 'Think of the most recent time. Without naming the road or the place, describe what it was about the road that affected how safe it felt.' },
        { type: 'multi', id: 'actionsSafety', code: 'A3.3', prompt: 'What did you do?', help: 'Select all that apply.', options: actions('actionsSafetyOther'), randomize: 'actions' },
        { type: 'single', id: 'timeSafety', code: 'A3.4', prompt: 'Was it daytime or after dark?', options: O.timeOfDay }
      ] },
      { id: 'safetyList', title: 'Roads and safety', questions: [
        { type: 'freelist', id: 'listSafety', code: 'A3.5', nothingId: 'listSafetyNothing', nothingLabel: 'Nothing about a road changes how safe it feels to me',
          prompt: 'List things about a road that can make it feel more safe or less safe to you.', help: LIST_HELP },
        { type: 'text', id: 'afterDark', code: 'A3.6', optionalLabel: true, quiet: true, prompt: 'If anything on your list matters differently after dark, write it here.' }
      ] },
      { id: 'more', title: 'Roads and safety', questions: [
        { type: 'text', id: 'anythingElse', code: 'A3.7', long: true, optionalLabel: true, quiet: true, prompt: 'Is there anything else about a road that affects whether you use it, that these questions have not covered?' }
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
    travel: travelPage('B4', [
      { type: 'single', id: 'tookPartBefore', code: 'B4.6', prompt: 'Before today, did you take part in another survey from this study, about how women choose which roads to use?', options: O.yesNoUnsure }
    ]),
    debrief: { id: 'debrief', title: 'Last questions', questions: [
      { type: 'text', id: 'unclearItems', code: 'B5.1', long: true, optionalLabel: true, quiet: true, prompt: 'Was any item unclear? If so, which one, and why?' },
      { type: 'text', id: 'missingItems', code: 'B5.2', long: true, optionalLabel: true, quiet: true, prompt: 'Is anything missing that matters to you when you decide whether a road is safe enough to use?' }
    ] }
  };

  var closing = 'Thank you for taking part. Your answers have been saved.';

  var root = typeof window !== 'undefined' ? window : globalThis;
  root.QUESTIONS = { options: O, formA: formA, formB: formB, closing: closing };
})();
