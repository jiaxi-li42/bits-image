# Bits Image — Setup

Current setup, environment variables, database migrations, and deployment instructions are in [README.md](README.md).

The old P0 guide is obsolete: web uploads and shared-passcode protection are implemented.
New environments should apply existing migrations; do not generate migrations first or substitute db:push.
Browser uploads require the private R2 bucket's CORS policy for the exact application origin. See the direct-upload configuration in README.md; the 50 MiB file body must not pass through a Server Action.
