// Posts to a Netlify form from script rather than from a submit button.
//
// Netlify registers a form by finding it in the built HTML, and accepts a
// submission for it as a POST to any path on the site. The dashboard uses this
// so that a claim made entirely in the browser still lands in the inbox the
// way a claim form submission always has — no mailbox, no new service.
//
// Skipped off the live site: the dev server and deploy previews have no
// Netlify form handler, so the POST would 404 and, worse, a preview could
// send a real-looking claim notice for a test.

const PRODUCTION_HOSTS = new Set([
  'verifiedhomeinspector.com',
  'www.verifiedhomeinspector.com',
]);

export async function submitNetlifyForm(
  formName: string,
  fields: Record<string, string>,
): Promise<boolean> {
  if (!PRODUCTION_HOSTS.has(window.location.hostname)) {
    console.info(`[netlify-forms] skipped "${formName}" — ${window.location.hostname} is not the live site`);
    return false;
  }
  try {
    const body = new URLSearchParams({ 'form-name': formName, ...fields });
    const res = await fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    return res.ok;
  } catch (err) {
    // A notification failing must never make the inspector's own action look
    // failed: the claim is already saved by the time this runs.
    console.error(`[netlify-forms] "${formName}" failed:`, err);
    return false;
  }
}
