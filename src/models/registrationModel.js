import mongoose from "mongoose";

const registrationSchema = new mongoose.Schema(
  {
    programme: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Programme",
      required: true,
    },

    full_name: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
      maxLength: [100, "Name cannot exceed 100 characters"],
    },

    email: {
      type: String,
      required: [true, "Email is required"],
      trim: true,
      lowercase: true,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        "Please provide a valid email address",
      ],
    },

    phone_number: {
      type: String,
      required: [true, "Phone number is required"],
      trim: true,
    },

    registration_reference: {
      type: String,
      required: true,
      unique: true,
    },

    qr_token: {
      type: String,
      required: true,
      unique: true,
      select: false,
    },

    status: {
      type: String,
      enum: ["registered", "cancelled"],
      default: "registered",
    },

    checked_in: {
      type: Boolean,
      default: false,
    },

    checked_in_at: {
      type: Date,
      default: null,
    },
    checked_in_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

// Only one active registration per email per programme.
// Prevent the same email from registering twice
// for the same programme.
registrationSchema.index(
  { programme: 1, email: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: "registered",
    },
  },
);

// Prevent QR token hashes from appearing in JSON responses.
registrationSchema.set("toJSON", {
  transform: function (doc, ret) {
    delete ret.qr_token;
    delete ret.__v;
    return ret;
  },
});

const Registration = mongoose.model("Registration", registrationSchema);

export default Registration;
