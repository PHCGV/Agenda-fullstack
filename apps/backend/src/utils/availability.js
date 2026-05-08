import { addMinutes, minutesToTime, parseTimeToMinutes, toUtcDate } from "./time.js";

export function buildSlots(dateString, rules, fallback) {
  const usableRules = rules.length
    ? rules
    : [
        {
          startTime: fallback.startTime,
          endTime: fallback.endTime,
          slotMinutes: fallback.slotMinutes,
          isActive: true
        }
      ];

  const slots = [];

  for (const rule of usableRules) {
    if (!rule.isActive) {
      continue;
    }

    const startMinutes = parseTimeToMinutes(rule.startTime);
    const endMinutes = parseTimeToMinutes(rule.endTime);
    const slotMinutes = rule.slotMinutes ?? fallback.slotMinutes;

    for (let current = startMinutes; current + slotMinutes <= endMinutes; current += slotMinutes) {
      const startAt = toUtcDate(dateString, minutesToTime(current));
      const endAt = addMinutes(startAt, slotMinutes);
      slots.push({ startAt, endAt });
    }
  }

  return slots;
}

export function filterConflicts(slots, appointments) {
  return slots.filter((slot) => {
    return !appointments.some((appointment) => {
      const startsBeforeEnd = appointment.startAt < slot.endAt;
      const endsAfterStart = appointment.endAt > slot.startAt;
      return startsBeforeEnd && endsAfterStart;
    });
  });
}
