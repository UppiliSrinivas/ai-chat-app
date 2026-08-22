import { Schema, model, type InferSchemaType } from "mongoose";

/**
 * An optional grouping for chats. A chat with no projectId is standalone,
 * which is why nothing here is required beyond the owner.
 */
const projectSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, default: "New project", trim: true },
  },
  { timestamps: true },
);

export type ProjectDoc = InferSchemaType<typeof projectSchema>;

export const Project = model("Project", projectSchema);
