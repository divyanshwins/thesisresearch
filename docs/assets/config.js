/*
 * config.js: the study's own details, shown on the consent page.
 * 1. The research team and a contact (shown as "Who is doing it").
 * 2. After approval: the ethics committee's name, the approval reference and the
 *    committee's contact, exactly as on the approval letter (shown as "Ethics
 *    approval"). Until all of them are filled in, test mode (?test=1) lists what is
 *    missing, and no link should go to participants.
 * 3. A support line suitable for your participants' country.
 * The backend runs on the same site at /api (api/index.js on Vercel).
 */
window.APP_CONFIG = {
  apiUrl: '/api',
  study: {
    researcher: 'Divyansh Srivastava',
    role: 'M.Des student',
    department: 'Department of Design',
    institution: 'Indian Institute of Technology Roorkee',
    contact: 'divyansh_s@design.iitr.ac.in',
    supervisor: '',        // your guide, e.g. 'Prof. A. B. Name, Department of Design, IIT Roorkee'
    ethicsCommittee: '',   // as written on the approval letter, e.g. 'the Institute Human Ethics Committee, IIT Roorkee'
    ethicsRef: '',         // the approval number on that letter
    ethicsContact: ''      // the committee's email address, for participants' concerns about their rights
  },
  supportText: 'If any of these topics were upsetting, you can contact a local women’s helpline or the emergency number in your country.',
  plannedSampleB: 50       // the Form B sample size planned in advance; the ranking is marked provisional below it
};
