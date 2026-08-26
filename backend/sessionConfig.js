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
