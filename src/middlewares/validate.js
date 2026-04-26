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
    });

    if (error) {
      const details = error.details.map((d) => ({
        field: d.path.join('.'),
        message: d.message,
      }));
      return next(ApiError.badRequest('Validation failed', details));
    }

    req[source] = value;
    next();
  };

module.exports = validate;
