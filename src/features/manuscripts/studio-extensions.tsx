"use client";
/**
 * Registered workspace extensions. The collaboration builder adds its extension objects to this array
 * (one import + one entry); the core workspace renders them through the slots defined in extensions.ts.
 */
import type { StudioExtension } from "./extensions";
import { collabExtension } from "../ms-collab/components/studio/extension";

export const studioExtensions: StudioExtension[] = [collabExtension];
