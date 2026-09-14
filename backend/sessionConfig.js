// Each deployment reads its own signing secret so one env source can hold all
// three. DEPLOY_ENV is injected in every container (deploy.groovy).
const SESSION_SECRET_ENV_NAME = Object.freeze({
  development: "SESSION_SECRET_DEV",
  staging: "SESSION_SECRET_STAGING",
  production: "SESSION_SECRET_PROD",
});

/*
 * @behavior Name the signing secret a deployment must provide and read its trimmed
 *           value, so the app can fail closed before it touches the database.
 * @param env — the process environment
 * @returns the environment variable name and its value (null when absent or blank)
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
 * @returns explicit session persistence and cookie settings
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
