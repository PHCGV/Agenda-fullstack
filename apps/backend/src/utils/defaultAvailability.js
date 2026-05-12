import { config } from "../config/env.js";

const defaultWeekdays = [1, 2, 3, 4, 5];

export function buildDefaultAvailabilityRules(userId) {
  return defaultWeekdays.map((dayOfWeek) => ({
    userId,
    dayOfWeek,
    startTime: config.defaultWorkStart,
    endTime: config.defaultWorkEnd,
    slotMinutes: config.defaultSlotMinutes,
    isActive: true
  }));
}
