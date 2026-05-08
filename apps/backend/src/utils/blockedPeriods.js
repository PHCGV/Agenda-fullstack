import { parseTimeToMinutes, toUtcDate } from "./time.js";

function buildIntervalForRecurring(dateString, period) {
  if (period.dayOfWeek === null || period.startTime === null || period.endTime === null) {
    return null;
  }

  const startAt = toUtcDate(dateString, period.startTime);
  const endAt = toUtcDate(dateString, period.endTime);

  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    return null;
  }

  if (endAt <= startAt) {
    return null;
  }

  return { startAt, endAt };
}

function buildIntervalForSingle(period) {
  if (!period.startAt || !period.endAt) {
    return null;
  }

  return { startAt: period.startAt, endAt: period.endAt };
}

export function collectBlockedIntervals(dateString, blockedPeriods) {
  const intervals = [];

  for (const period of blockedPeriods) {
    const interval = period.isRecurring
      ? buildIntervalForRecurring(dateString, period)
      : buildIntervalForSingle(period);

    if (interval) {
      intervals.push(interval);
    }
  }

  return intervals;
}

export function filterBlockedSlots(slots, blockedPeriods, dateString) {
  if (!blockedPeriods.length) {
    return slots;
  }

  const intervals = collectBlockedIntervals(dateString, blockedPeriods);
  if (!intervals.length) {
    return slots;
  }

  return slots.filter((slot) => {
    return !intervals.some((blocked) => {
      const startsBeforeEnd = blocked.startAt < slot.endAt;
      const endsAfterStart = blocked.endAt > slot.startAt;
      return startsBeforeEnd && endsAfterStart;
    });
  });
}

export function isSlotBlocked(startAt, endAt, blockedPeriods, dateString) {
  const intervals = collectBlockedIntervals(dateString, blockedPeriods);
  return intervals.some((blocked) => blocked.startAt < endAt && blocked.endAt > startAt);
}

export function isTimeRangeValid(startTime, endTime) {
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);
  return !Number.isNaN(start) && !Number.isNaN(end) && end > start;
}
