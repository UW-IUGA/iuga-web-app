/*
* Purpose: Build the session settings the app hands to express-session, and work out which signing
* secret this deployment must provide.
* Authentication/Authorization Requirements: None; this file only reads configuration.
* Expected Request Information: The process environment: DEPLOY_ENV, and the session secret for it.
* Expected Response Information: The secret's environment variable name and value, and the session
* options — no cookie before sign-in, no re-saving, httpOnly, secure outside development.
*/

// Each deployment reads its own signing secret so one env source can hold all
// three. DEPLOY_ENV is injected in every container (deploy.groovy).
const SESSION_SECRET_ENV_NAME = Object.freeze({
  development: "SESSION_SECRET_DEV",
  staging: "SESSION_SECRET_STAGING",
  production: "SESSION_SECRET_PROD",
});

/*
 * @behavior Name the signing secret this deployment must provide, and read its value, so the app
 *           can stop at startup instead of failing at the first sign-in.
 * @param env — the process environment
 * @returns the environment variable name read, and its value, or null when it is missing or blank
 */
export function readSessionSecret(env = {}) {
  const envName = SESSION_SECRET_ENV_NAME[env.DEPLOY_ENV] ?? "SESSION_SECRET";
  const raw = env[envName];
  return { envName, value: typeof raw === "string" ? raw.trim() || null : null };
}

/*
 * @behavior Build the express-session options for the current deployment environment.
 * @param sessionSecret — the operator-provided signing secret
 * @param deployEnv — the configured deployment environment
 * @returns the session settings: store nothing for a visitor who has not signed in, re-save
 *          nothing, and mark the cookie httpOnly and secure outside development
 */
export function createSessionOptions(sessionSecret, deployEnv) {
  return {
    secret: sessionSecret,
    saveUninitialized: false,
    resave: false,
    cookie: {
      httpOnly: true,
      secure: deployEnv === "staging" || deployEnv === "production",
      sameSite: "lax",
    },
  };
}
