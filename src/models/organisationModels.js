import mongoose from "mongoose";

const organisationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Organisation name is required"],
      trim: true,
      minLength: [5, "Organisation name is too short"],
      maxLength: [50, "Organisation name is too long"],
    },

    email: {
      type: String,
      required: [true, "Organisation email is required"],
      trim: true,
      lowercase: true,
      unique: true,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        "Please provide a valid email address",
      ],
    },

    type: {
      type: String,
      enum: [
        "company",
        "government",
        "educational",
        "non_profit",
        "religious",
        "other",
      ],
      required: [true, "Organisation type is required"],
    },

    description: {
      type: String,
      trim: true,
      maxLength: [1000, "Description cannot exceed 1000 characters"],
      default: null,
    },

    phone_number: {
      type: String,
      trim: true,
      default: null,
    },

    website: {
      type: String,
      trim: true,
      default: null,
    },

    logo: {
      url: {
        type: String,
      },

      public_id: {
        type: String,
      },
    },

    address: {
      type: String,
      trim: true,
      default: null,
    },

    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    members: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        role: {
          type: String,
          enum: ["manager", "editor", "check_in_staff", "viewer"],
          default: "viewer",
        },
        joinedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    isVerified: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

// prevent duplicate members

organisationSchema.path("members").validate(function (members) {
  const memberIds = members.map((member) => member.user.toString());

  return new Set(memberIds).size === memberIds.length;
}, "A user cannot be added to an organisation more than once");

const Organisation = mongoose.model("Organisation", organisationSchema);
export default Organisation;
