# Performance and responsive changes

- One bootstrap request loads the session, account and leaderboard; refresh requests run in parallel.
- One minified stylesheet and one deferred application script replace separate startup resources.
- The pump JavaScript and image load only when the free filling screen is opened.
- Content-hashed assets use immutable caching. The Sites worker supports gzip and conditional ETag requests.
- Remote font loading is replaced with the system font stack.
- Idle pump screens stop repeated DOM updates; active fuel readings update at 20 fps and connection animation uses animation frames.
- Narrow-screen forms stack, leaderboard cards wrap, and tank summaries use a single column on phones.

Validated: Sites build, Vercel build and 35 automated tests, including cached/compressed responses, gas rules and portable runtime identity isolation. These checks are not device-browser QA or a measured live Lighthouse score. Hosted Vercel connectivity and real email delivery require your configured services.
