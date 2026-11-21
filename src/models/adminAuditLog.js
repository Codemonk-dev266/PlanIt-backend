import mongoose from "mongoose";

const adminAuditLogSchema = new mongoose.Schema(
  {
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    action: {
      type: String,
      required: true,
      enum: [
        "programme_updated",
        "programme_published",
        "programme_unpublished",
        "programme_cancelled",
        "programme_completed",
        "registration_disabled",
        "registration_enabled",
        "checkin_corrected",
        "admin_created",
        "admin_role_changed",
        "admin_deactivated",
        "admin_reactivated",
        "user_deactivated",
        "user_reactivated",
      ],
    },

    targetType: {
      type: String,
      required: true,
      enum: ["programme", "registration", "user"],
    },

    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },

    reason: {
      type: String,
      required: true,
      trim: true,
      minLength: [10, "Reason must be at least 10 characters"],
      maxLength: [1000, "Reason cannot exceed 1000 characters"],
    },

    changes: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  { timestamps: true },
);

adminAuditLogSchema.index({
  admin: 1,
  createdAt: -1,
});

adminAuditLogSchema.index({
  targetType: 1,
  targetId: 1,
});

const AdminAuditLog = mongoose.model("AdminAuditLog", adminAuditLogSchema);

export default AdminAuditLog;
