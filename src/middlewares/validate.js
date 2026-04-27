const { ApiError } = require('../utils/ApiError');

/**
 * Express middleware factory: runs a Joi schema against req[source]
 * (default: req.body). On success it REPLACES req[source] with the
 * sanitized value (extra fields stripped, types coerced, defaults applied).
 *
 * Usage:
 *   router.post('/login', validate(loginSchema), controller.login);
 *   router.get('/branches', validate(filterSchema, 'query'), controller.list);
 */
const validate =
  (schema, source = 'body') =>
  (req, res, next) => {
    const { error, value } = schema.validate(req[source], {
      abortEarly: false, // collect all errors, not just the first
      stripUnknown: true, // drop fields not declared in the schema
      convert: true, // coerce strings to declared types (numbers, booleans)
    });

    if (error) {
      const details = error.details.map((d) => ({
        field: d.path.join('.'),
        message: d.message,
      }));
      return next(ApiError.badRequest('Validation failed', details));
    }

    // Express 5 made req.query a read-only getter, so direct assignment
    // is silently ignored. We expose validated query under a separate
    // property; controllers read from req.validatedQuery for list endpoints.
    // req.body and req.params remain writable, so we keep replacing them
    // in place for source consistency at the call site.
    if (source === 'query') {
      req.validatedQuery = value;
    } else {
      req[source] = value;
    }
    next();
  };

module.exports = validate;
