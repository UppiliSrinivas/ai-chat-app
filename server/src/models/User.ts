import { Schema, model, type InferSchemaType } from "mongoose";

/**
 * A user is either anonymous or has a password — `email`/`passwordHash`
 * are optional so an anonymous document can omit both. `sparse` lets
 * multiple documents omit `email` without tripping its unique index.
 */
const userSchema = new Schema(
  {
    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
    },
    isAnonymous: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

export type UserDoc = InferSchemaType<typeof userSchema>;

export const User = model("User", userSchema);
