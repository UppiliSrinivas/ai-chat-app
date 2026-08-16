import { Schema, model, type InferSchemaType } from "mongoose";

/**
 * A user is anonymous, has a password, is linked to a Google account, or some
 * combination — every identifying field is optional so an anonymous document
 * can omit all of them. `sparse` lets multiple documents omit an indexed field
 * without tripping its unique index.
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
    // Google's `sub` claim, not the email: an account's address can change,
    // this identifier never does.
    googleId: {
      type: String,
      unique: true,
      sparse: true,
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
