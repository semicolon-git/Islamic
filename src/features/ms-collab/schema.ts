/** zod schemas for every collaboration API body. */
import { z } from "zod";
import { tokensSchema } from "../manuscripts/schema";
import { QUOTE_CLASSES } from "./quran-detect";

const id = z.string().trim().min(1).max(120);

export const assignSchema = z.object({
  page_ids: z.array(id).min(1).max(40),
  assignee_id: id,
  kind: z.enum(["transcribe", "verify", "double_key", "review"]).default("transcribe"),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
  due_at: z.string().trim().max(40).nullable().optional().refine((v) => !v || !Number.isNaN(Date.parse(v)), "Invalid date"),
  note: z.string().trim().max(500).optional(),
  line_ids: z.array(id).max(500).optional(),
});

export const taskActionSchema = z.object({ action: z.enum(["done", "cancel", "reopen"]) });

export const keyingSchema = z.union([
  z.object({ reading: z.string().trim().min(1).max(120), cant_read: z.null().optional() }),
  z.object({ cant_read: z.enum(["illegible", "damage"]), reading: z.null().optional() }),
]);

export const decideWordSchema = z.union([
  z.object({ text: z.string().trim().min(1).max(120) }),
  z.object({ gap: z.enum(["illegible", "damage"]) }),
]);

export const suggestionSchema = z.object({
  base_version: z.number().int().min(0),
  tokens: tokensSchema,
  reason: z.string().trim().min(3, "Say briefly why (at least a few words).").max(500),
});

export const suggestionDecisionSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("accept"), note: z.string().trim().max(500).optional() }),
  z.object({ decision: z.literal("accept_edit"), tokens: tokensSchema, note: z.string().trim().max(500).optional() }),
  z.object({ decision: z.literal("reject"), note: z.string().trim().max(500).optional() }),
]);

export const commentSchema = z.object({
  line_id: id.nullable().optional(),
  parent_id: id.nullable().optional(),
  body: z.string().trim().min(1).max(2000),
  anchor: z.object({ from: z.number().int().min(0), to: z.number().int().min(0), text: z.string().max(400) }).nullable().optional(),
});

export const resolveSchema = z.object({ resolved: z.boolean() });

export const quoteReviewSchema = z.object({
  status: z.enum(["confirmed", "rejected", "suggested"]),
  classification: z.enum(QUOTE_CLASSES).nullable().optional(),
});

export const abbrConfirmSchema = z.object({
  line_id: id,
  base_version: z.number().int().min(0),
  token_index: z.number().int().min(0).optional(),
  start: z.number().int().min(0).optional(),
  end: z.number().int().min(0).optional(),
  expan: z.string().trim().min(1).max(200),
}).refine((v) => v.token_index !== undefined || (v.start !== undefined && v.end !== undefined && v.end > v.start), "Give a token or a range.");

export const presenceSchema = z.object({ line_id: id.nullable().optional(), leaving: z.boolean().optional() });

export const reviewLineSchema = z.object({
  decision: z.enum(["accept", "revert"]),
  base_version: z.number().int().min(0).optional(),
  note: z.string().trim().max(500).optional(),
});

export const reviewPageSchema = z.object({ decision: z.enum(["approve", "return"]), note: z.string().trim().max(1000).optional() });

export const explainSchema = z.object({ ai: z.boolean().optional() });
