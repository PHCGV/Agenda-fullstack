const receptionVisibleActions = new Set([
  "APPOINTMENT_CREATED",
  "APPOINTMENT_STATUS_UPDATED",
  "APPOINTMENT_SPACE_UPDATED",
  "BLOCKED_PERIOD_CREATED",
  "BLOCKED_PERIOD_DELETED",
  "SPACE_CREATED",
  "SPACE_UPDATED",
  "SPACE_DEACTIVATED",
  "STAFF_SIGNUP_REQUEST_APPROVED",
  "STAFF_SIGNUP_REQUEST_REJECTED",
  "NOTIFICATION_CANCELED",
  "AVAILABILITY_UPDATED"
]);

export function createAuditEntry(actor, payload) {
  return {
    actorId: actor?.id ?? null,
    actorRole: actor?.role ?? null,
    action: payload.action,
    entityType: payload.entityType,
    entityId: payload.entityId ?? null,
    summary: payload.summary,
    metadata: payload.metadata ?? null
  };
}

export async function writeAuditLog(target, actor, payload) {
  return target.auditLog.create({
    data: createAuditEntry(actor, payload)
  });
}

export function canViewAuditAction(role, action) {
  if (role === "ADMIN") {
    return true;
  }

  if (role === "RECEPTION") {
    return receptionVisibleActions.has(action);
  }

  return false;
}

export function getVisibleAuditActionsForRole(role) {
  if (role === "ADMIN") {
    return null;
  }

  if (role === "RECEPTION") {
    return Array.from(receptionVisibleActions);
  }

  return [];
}
