# Android builds with EAS

Expo app root / Expo GitHub Base directory: `mobile`.
Keep repository context (`packages/core` is imported by the app). Run CLI commands
from `mobile/`, not the Next.js repository root. Apple is excluded for now.

- `npm run build:preview`: installable Android APK for device review.
- `npm run build:production`: Android App Bundle for future store submission.
- `npm run build:workflow`: manually run the preview workflow.
- `npm run build:workflow:production`: manually run Create Production Builds.

`.eas/workflows/android-preview.yml` builds preview APKs on pushes to `mobile`.
`.eas/workflows/create-production-builds.yml` is manual and builds Android only.
Neither workflow submits to a store. Each build runs type checks and unit tests
in the EAS post-install hook. Public Supabase configuration is in eas.json;
private test passwords, server credentials and signing keys must not be added.

## Link the existing Expo project once

Obtain the actual project URL/UUID and owner from the user's existing expo.dev
project. Authenticate via `eas login` locally or an `EXPO_TOKEN` supplied through
secure environment settings. Never paste a token into chat or commit it.
Run `npx eas-cli@25.0.0 init --id <existing-project-uuid>` from mobile and review
app.json's owner/slug/extra.eas.projectId against that project. Do not create a
second project or guess the identity. Confirm GitHub Base directory is `mobile`.
Initial Android signing credentials may need setup in the authenticated account.

After linkage, run a preview build and record the build ID, commit SHA, status
and APK installation URL. A queued build is not a successful build; review its
native logs and test the installed app. Subsequent mobile changes should receive
a preview build through the workflow after local checks.

## Current setup status

The Android build submission and Expo workflow validation commands were attempted
but stopped because this workspace is not logged into Expo. No build was queued.
Local EAS JSON schema/profile validation, YAML parsing, Expo config resolution,
TypeScript and unit checks passed. The existing Expo project UUID/owner is still
needed to link app.json; server-side workflow validation remains pending login.

At inspection, remote `mobile` contains the contract but not the Expo app. The
app and this configuration are in draft PR #1 targeting mobile. The user's review
before merge remains required. Automatic mobile-branch builds become applicable
once the app/configuration are merged and the Expo project is linked. Until then,
authenticated CLI builds can use the review branch. Do not claim the workflow is
active or that an install link exists until Expo confirms the build.
