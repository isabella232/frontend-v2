const request = require('request')
const jwks = require('jwks-rsa')
const jwt = require('express-jwt')
const { FormField, PublicApi } = require('@oryd/kratos-client')
const config = require('../../config')
const { authHandler } = require('./authHandler')
const { dashboard } = require('./dashboard')
const { errorHandler } = require('./errorHandler')

const protectOathKeeper = jwt({
  // Dynamically provide a signing key based on the kid in the header and the signing keys provided by the JWKS endpoint.
  secret: jwks.expressJwtSecret({
    cache: true,
    jwksRequestsPerMinute: 5,
    jwksUri: '/',
  }),
  algorithms: ['RS256'],
})

const publicEndpoint = new PublicApi(config.get('kratos').public)
const protectProxy = (req, res, next) => {
  // When using ORY Oathkeeper, the redirection is done by ORY Oathkeeper.
  // Since we're checking for the session ourselves here, we redirect here
  // if the session is invalid.
  publicEndpoint
    .whoami(req)
    .then(({ body, response }) => {
      req.user = {session: body};
      next()
    })
    .catch(() => {
      res.redirect(config.get('SITE_URL') + '/auth/login')
    })
}

const protect = protectProxy

module.exports = function(app) {
  app.use((req, res, next) => {
    if (req.cookies.ory_kratos_session) {
      publicEndpoint
        .whoami(req)
        .then(({ body, response }) => {
          res.locals.logged_in = true;
          res.locals.userEmail = body.identity.traits.email;
          res.locals.userId = body.identity.id;
          next()
        })
        .catch(() => {
          next()
        })
    } else {
      next()
    }
  })
  app.use('/.ory/kratos/public/', (req, res) => {
    const url =
      config.get('kratos').public + req.url.replace('/.ory/kratos/public', '')
    req
      .pipe(
        request(url, { followRedirect: false })
          .on('error', err => console.error)
      )
      .pipe(res)
  })
  app.get('/dashboard', protect, dashboard)
  app.get('/auth/registration', authHandler('registration'))
  app.get('/auth/login', authHandler('login'))
  app.get('/auth/logout', (req, res) => {
    res.redirect('/.ory/kratos/public/self-service/browser/flows/logout')
  })
  app.get('/error', errorHandler)
  app.get('/settings', protect)
}
