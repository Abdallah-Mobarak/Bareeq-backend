const crypto = require('node:crypto');

const { config } = require('../config/env');
const { ApiError } = require('../utils/ApiError');
const { logger } = require('../utils/logger');

/**
 * Thin PayTabs (Hosted Payment Page) integration. Stateless — it only talks
 * to the PayTabs REST API and verifies callback signatures; all persistence
 * and wallet crediting lives in the calling modules.
 *
 * Uses Node's built-in global `fetch` (Node 18+) — no extra HTTP dependency.
 */

const isConfigured = () => Boolean(config.payTabs.profileId && config.payTabs.serverKey);

/**
 * Create a hosted payment page. Returns { tranRef, paymentUrl }.
 * Throws ApiError.internal on any gateway/configuration failure.
 */
const createHostedPayment = async ({
  cartId,
  amount,
  description = 'Wallet top-up',
  customer,
  callbackUrl,
  returnUrl,
  lang = 'ar',
}) => {
  if (!isConfigured()) {
    throw ApiError.internal('PayTabs is not configured');
  }

  const body = {
    profile_id: Number(config.payTabs.profileId),
    tran_type: 'sale',
    tran_class: 'ecom',
    cart_id: cartId,
    cart_currency: 'SAR',
    cart_amount: Number(Number(amount).toFixed(2)),
    cart_description: description,
    paypage_lang: lang,
    customer_details: customer,
    callback: callbackUrl,
    return: returnUrl,
    hide_shipping: true,
  };

  let res;
  let data;
  try {
    res = await fetch(`${config.payTabs.baseUrl}/payment/request`, {
      method: 'POST',
      headers: {
        authorization: config.payTabs.serverKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    data = await res.json();
  } catch (err) {
    logger.error({ err: err.message, cartId }, 'PayTabs create request failed');
    throw ApiError.internal('Payment gateway is unavailable');
  }

  if (!res.ok || !data || !data.redirect_url || !data.tran_ref) {
    logger.error({ status: res.status, data, cartId }, 'PayTabs create returned no redirect_url');
    throw ApiError.internal('Failed to create payment session');
  }

  return { tranRef: data.tran_ref, paymentUrl: data.redirect_url };
};

/**
 * Server-side confirmation of a transaction (defence-in-depth against a
 * forged callback). Returns the PayTabs payload or null if it can't be
 * reached — callers treat null as "could not confirm" and fall back to the
 * signature-verified callback result.
 */
const queryTransaction = async (tranRef) => {
  if (!isConfigured() || !tranRef) {
    return null;
  }
  try {
    const res = await fetch(`${config.payTabs.baseUrl}/payment/query`, {
      method: 'POST',
      headers: {
        authorization: config.payTabs.serverKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ profile_id: Number(config.payTabs.profileId), tran_ref: tranRef }),
    });
    if (!res.ok) {
      return null;
    }
    return await res.json();
  } catch (err) {
    logger.warn({ err: err.message, tranRef }, 'PayTabs query failed');
    return null;
  }
};

/**
 * Verify the callback's `signature` header: HMAC-SHA256 of the RAW request
 * body keyed with the server key, compared in constant time.
 * @param {Buffer|string} rawBody exact bytes PayTabs POSTed
 * @param {string} signature value of the `signature` header (hex)
 */
const verifySignature = (rawBody, signature) => {
  if (!config.payTabs.serverKey || !signature || !rawBody) {
    return false;
  }
  const expected = crypto
    .createHmac('sha256', config.payTabs.serverKey)
    .update(rawBody)
    .digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
};

module.exports = { isConfigured, createHostedPayment, queryTransaction, verifySignature };
