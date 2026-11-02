# Takedown

Deployment (2026-11-02, PLAN.md D21): public repository `dragoonant/legion-forge`; GitHub Pages at https://dragoonant.github.io/legion-forge/, deployed by `.github/workflows/ci.yml` on every push to `main`.

## Take the site down (minutes)
1. GitHub: repository Settings -> Pages -> "Unpublish site" (or Settings -> Pages -> Source: None).
2. Stop redeploys: delete the `upload-pages-artifact` step and the `deploy` job from `.github/workflows/ci.yml` and push, or with the GitHub CLI: `gh workflow disable "CI and Pages" -R dragoonant/legion-forge`.
3. If asked to remove the source as well: Settings -> General -> Danger Zone -> Change visibility -> Private (`gh repo edit dragoonant/legion-forge --visibility private --accept-visibility-change-consequences`).

## Remove named content only
Real names live only in `src/data/**` (`name` fields) and the generated art file names. Replacing them is a data change; the client reads every displayed name from data. Rebuild and push to redeploy.

## Keep in sync
Whoever changes the deployment updates this file, `NOTICE.md`, `README.md` and `PLAN.md` (D21) in the same commit.
