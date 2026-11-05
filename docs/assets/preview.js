/*
 * preview.js: used only while assets/config.js has no backend address (for
 * example on a fresh public link, or when a page is opened as a file).
 * The forms then run as a preview: every page shows that it is a preview,
 * and nothing is saved or sent. Once apiUrl is filled in, this file is ignored.
 *
 * Form B items: the 12 placeholders of the questionnaire's Appendix 1, which
 * only illustrate the format. Sets: the cyclic design the backend builds for
 * K = 12 (Engine.cyclicDesign, initial block {0, 1, 3, 7}); a test checks
 * that both match.
 */
window.PREVIEW_CONFIG = {
  ok: true,
  formAOpen: true,
  formB: {
    open: true,
    designVersion: 0,
    items: [
      { label: 'How well lit the road is', description: 'Street lights or other light on the road' },
      { label: 'How clearly you can see ahead and around', description: 'Open view, or blind corners and walls' },
      { label: 'How many other people are on the road', description: 'Walkers, riders and people waiting' },
      { label: 'How many shops or homes face the road', description: 'Whether buildings face the road or it runs along empty land' },
      { label: 'What you have heard about the road', description: 'From family, friends, news or social media' },
      { label: 'How easily you could leave the road', description: 'Side lanes, shops or exits you could step into' },
      { label: 'Whether groups of people are standing around', description: 'Groups standing or sitting along the road' },
      { label: 'Whether the road is flooded or blocked', description: 'Water, digging, parked vehicles or construction' },
      { label: 'The mix of men and women on the road', description: 'Whether the people nearby are mostly women, mostly men or mixed' },
      { label: 'Whether police or security staff are visible', description: 'Uniformed staff or a post nearby' },
      { label: 'Whether shops open late are nearby', description: 'Shops, chemists or ATMs that are open at that hour' },
      { label: 'How well you know the road', description: 'Whether you have used it before' }
    ],
    sets: [[0, 1, 3, 7], [1, 2, 4, 8], [2, 3, 5, 9], [3, 4, 6, 10], [4, 5, 7, 11], [5, 6, 8, 0],
           [6, 7, 9, 1], [7, 8, 10, 2], [8, 9, 11, 3], [9, 10, 0, 4], [10, 11, 1, 5], [11, 0, 2, 6]]
  }
};
