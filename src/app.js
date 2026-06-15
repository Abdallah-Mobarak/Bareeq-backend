const path = require('node:path');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');

const { config } = require('./config/env');
const { requestLogger } = require('./middlewares/requestLogger');
const { errorHandler } = require('./middlewares/errorHandler');
const { notFound } = require('./middlewares/notFound');
const { checkDatabaseConnection } = require('./infrastructure/database/prisma');
const { asyncHandler } = require('./utils/asyncHandler');
const routes = require('./routes');

/**
 * Build the Express app.
 *
 * Middleware order matters:
 *   1. Security headers (helmet)
 *   2. CORS
 *   3. Compression
 *   4. Body parsers
 *   5. Request logger
 *   6. Routes
 *   7. 404 handler (after all routes)
 *   8. Global error handler (must be last)
 */
const app = express();

/**
 * Use the `qs` library for query parsing (Express's "extended" mode)
 * so that array-style query strings work. We need this for endpoints
 * that accept lists like `?ids[]=a&ids[]=b` — the simple parser maps
 * those to `req.query['ids[]']` instead of `req.query.ids`.
 *
 * Comma-separated and repeated forms (?ids=a,b and ?ids=a&ids=b) work
 * with either parser.
 */
app.set('query parser', 'extended');

// 1-3: Security, CORS, compression
app.use(helmet());
app.use(cors());
app.use(compression());

// 4: Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 5: Request logging
app.use(requestLogger);

// 6a-pre: Static serving for uploaded assets (visit photos, marketplace
//         images). Stored under <repo>/uploads; exposed at /uploads/* with
//         a long cache so clients can re-display cheaply.
//
//         Helmet's default sets `Cross-Origin-Resource-Policy: same-origin`,
//         which blocks browsers from embedding these files in <img> tags
//         from a different origin (e.g. the dashboard on localhost:4200)
//         even though CORS allows the fetch. Override CORP to `cross-origin`
//         for static assets only — they're public, non-credentialed files
//         meant to be embedded anywhere. The strict default still applies
//         to every API response.
app.use(
  '/uploads',
  (req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  },
  express.static(path.join(__dirname, '..', 'uploads'), {
    maxAge: '7d',
    etag: true,
    fallthrough: true,
  }),
);

// 6a: Health check — intentionally outside the API prefix so load balancers
//     and uptime monitors can hit a stable URL. Includes a DB ping so we
//     return 503 when the database is unreachable.
app.get(
  '/health',
  asyncHandler(async (req, res) => {
    const database = await checkDatabaseConnection();
    const isHealthy = database.ok;

    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: config.nodeEnv,
      checks: { database },
    });
  }),
);

// 6b: API routes under /api/v1
app.use(config.apiPrefix, routes);

// 7: 404 handler
app.use(notFound);

// 8: Error handler
app.use(errorHandler);

module.exports = app;
