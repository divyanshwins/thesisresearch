/*
 * config.js: the only file you edit after deploying the backend.
 * 1. Paste your Apps Script web-app URL (it ends in /exec) into apiUrl.
 * 2. Fill in who runs the study, a contact and the ethics approval reference.
 *    An informed-consent page must name these; the forms show them on the
 *    first page and warn in test mode (?test=1) while any is empty.
 * 3. Write a support line suitable for your participants' country.
 */
window.APP_CONFIG = {
  apiUrl: 'PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE',
  study: {
    researcher: '',        // e.g. 'Your name, M.Des student'
    institution: '',       // e.g. 'Department of Design, Indian Institute of Technology Roorkee'
    contact: '',           // an email address respondents can write to
    ethicsRef: ''          // the approval number given by your institute ethics committee
  },
  supportText: 'If any of these topics were upsetting, you can contact a local women’s helpline or the emergency number in your country.',
  plannedSampleB: 50       // the Form B sample size planned in advance; the ranking is marked provisional below it
};

// The local preview server (npm run dev) answers at /api on the same address.
if (['localhost', '127.0.0.1'].indexOf(location.hostname) >= 0) window.APP_CONFIG.apiUrl = '/api';
