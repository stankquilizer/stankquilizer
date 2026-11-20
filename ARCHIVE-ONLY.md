# maximal starter — archive only

This is a design prototype archive, not part of the production website.

- Canonical archive branch: `archive/maximal-starter`
- Prototype entry point: `prototypes/maximal-starter/index.html`
- Production branch: `main`
- Do not merge this branch into `main` as part of a production-site update.
- Do not select this branch as a Cloudflare production deployment branch.
- Do not connect this prototype directory as a separate Cloudflare Worker/Pages project unless a preview deployment is explicitly wanted.

The production Worker configuration on `main` serves the repository root as static assets. Keeping this archive on a separate Git branch is therefore intentional: the prototype files are not present in the production branch's deployed asset tree.

Cloudflare preview deployments are controlled by the Cloudflare project settings. If preview builds are enabled for every branch, this branch may still produce a non-production preview. Exclude `archive/maximal-starter` from preview builds in Cloudflare if even preview deployment is unwanted.

This archive is preserved for reference and future integration work. It is not an instruction to replace the current public site.
