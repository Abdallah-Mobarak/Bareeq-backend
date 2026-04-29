const { ApiError } = require('./ApiError');

/**
 * Add `days` calendar days to a Date and return a NEW Date (UTC-safe).
 */
const addDays = (date, days) => {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
};

/**
 * Returns the last day of the month that contains `date`, in UTC.
 * e.g. lastDayOfMonth(2026-05-02) => 2026-05-31.
 */
const lastDayOfMonth = (date) => {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth(); // 0..11
  return new Date(Date.UTC(y, m + 1, 0));
};

const startOfMonth = (date) => {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  return new Date(Date.UTC(y, m, 1));
};

const daysBetween = (a, b) => Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));

const sameMonth = (a, b) =>
  a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth();

/**
 * Distribute N visit dates across the month that contains `firstVisitDate`.
 *
 * Rules from the FRD (§4.2.2.2):
 *   1 visit  -> just the first date
 *   2 visits -> first date, then +15 days
 *   3+ visits -> evenly distributed between first date and end of month;
 *                the last visit lands ON the last day of the month
 *
 * No date may spill into the next month — if the rules would produce
 * one, we throw a 400 so the caller can either move firstVisitDate
 * earlier or reduce numberOfVisits.
 *
 * @param {number} numberOfVisits 1..4
 * @param {Date} firstVisitDate (UTC)
 * @returns {Date[]} array of N UTC Dates in chronological order
 * @throws {ApiError} if any computed date spills into the next month
 */
const distributeVisitDates = (numberOfVisits, firstVisitDate) => {
  if (!Number.isInteger(numberOfVisits) || numberOfVisits < 1 || numberOfVisits > 4) {
    throw ApiError.badRequest('numberOfVisits must be an integer between 1 and 4');
  }

  if (!(firstVisitDate instanceof Date) || Number.isNaN(firstVisitDate.getTime())) {
    throw ApiError.badRequest('firstVisitDate must be a valid date');
  }

  const monthStart = startOfMonth(firstVisitDate);
  const monthEnd = lastDayOfMonth(firstVisitDate);

  if (firstVisitDate < monthStart || firstVisitDate > monthEnd) {
    throw ApiError.badRequest('firstVisitDate is outside the schedule month');
  }

  if (numberOfVisits === 1) {
    return [firstVisitDate];
  }

  if (numberOfVisits === 2) {
    const second = addDays(firstVisitDate, 15);
    if (!sameMonth(second, firstVisitDate)) {
      throw ApiError.badRequest(
        'Cannot fit 2 visits 15 days apart within the month — pick an earlier first date',
      );
    }
    return [firstVisitDate, second];
  }

  // 3+ visits: even distribution, last one is the last day of the month.
  const totalDays = daysBetween(firstVisitDate, monthEnd);
  const intervals = numberOfVisits - 1;
  const step = Math.floor(totalDays / intervals);

  if (step < 1) {
    throw ApiError.badRequest(
      `Cannot fit ${numberOfVisits} visits between ${firstVisitDate.toISOString().slice(0, 10)} and end of month`,
    );
  }

  const dates = [];
  for (let i = 0; i < numberOfVisits; i += 1) {
    if (i === numberOfVisits - 1) {
      dates.push(monthEnd);
    } else {
      dates.push(addDays(firstVisitDate, i * step));
    }
  }

  return dates;
};

module.exports = { distributeVisitDates, lastDayOfMonth, addDays };
