/* *
* Purpose: Hold the sizes and addresses that bound the HTTP layer: how large a JSON body may be, and
* which browser origins may call the API.
* Authentication/Authorization Requirements: None; this file only holds values.
* Expected Request Information: Nothing; the app imports these when it configures CORS and body limits.
* Expected Response Information: REQUEST_BODY_LIMIT, the largest JSON body the API accepts, and
* ALLOWED_ORIGINS, the browser origins allowed to call it.
*/

export const REQUEST_BODY_LIMIT = "32kb";
export const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:5173",
  "https://iuga.info",
  "https://staging.iuga.info",
  "https://dev.iuga.info",
];
