import AdminAuditLog from "../models/adminAuditLog.js";

const createAdminAuditLog = async ({
  adminId,
  action,
  targetType,
  targetId,
  reason,
  changes = null,
  session = null,
}) => {
  const auditData = {
    admin: adminId,
    action,
    targetType,
    targetId,
    reason,
    changes,
  };

  if (session) {
    const [auditLog] = await AdminAuditLog.create([auditData], { session });

    return auditLog;
  }

  return AdminAuditLog.create(auditData);
};

export default createAdminAuditLog;
