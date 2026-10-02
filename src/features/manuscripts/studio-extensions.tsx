"use client";
/**
 * Registered workspace extensions. The collaboration builder adds its extension objects to this array
 * (one import + one entry); the core workspace renders them through the slots defined in extensions.ts.
 */
import type { StudioExtension } from "./extensions";

export const studioExtensions: StudioExtension[] = [];
