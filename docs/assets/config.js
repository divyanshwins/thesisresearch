/*
 * config.js: the study's own details, shown on the consent page.
 * 1. Fill in who runs the study, a contact and the ethics approval reference.
 *    An informed-consent page must name these; the forms show them on the
 *    first page and warn in test mode (?test=1) while any is empty.
 * 2. Write a support line suitable for your participants' country.
 * The backend runs on the same site at /api (api/index.js on Vercel); its
 * secrets are set in Vercel, never here.
 */
window.APP_CONFIG = {
  apiUrl: '/api',
  study: {
    researcher: '',        // e.g. 'Your name, M.Des student'
    institution: '',       // e.g. 'Department of Design, Indian Institute of Technology Roorkee'
    contact: '',           // an email address respondents can write to
    ethicsRef: ''          // the approval number given by your institute ethics committee
  },
  supportText: 'If any of these topics were upsetting, you can contact a local women’s helpline or the emergency number in your country.',
  plannedSampleB: 50       // the Form B sample size planned in advance; the ranking is marked provisional below it
};
