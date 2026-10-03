/**
 * Extension points of the page workspace. The collaboration layer (suggestions, double-keying, comments, review UI,
 * tasks, presence, Quran-quote annotations, collation) plugs in here without editing the core components.
 * See src/features/manuscripts/README.md.
 */
import type { ReactNode } from "react";
import type { LineDTO, PageDetail } from "./types";
import type { Tok } from "./tokens";

export interface WorkspaceContext {
  detail: PageDetail;
  /** Currently selected line, if any. */
  selected: LineDTO | null;
  selectLine: (lineId: string | null) => void;
  /** Re-fetch the page (after your feature changed data). */
  reload: () => Promise<void>;
  /** Zoom the image to a line. */
  zoomToLine: (lineId: string) => void;
}

export interface LineEditorContext extends WorkspaceContext {
  line: LineDTO;
  /** The editor's current (possibly unsaved) tokens. */
  tokens: Tok[];
  /** Replace the editor's tokens (counts as an edit: the transcriber still saves). */
  setTokens: (tokens: Tok[]) => void;
  canEdit: boolean;
}

export interface WorkspacePanel {
  id: string;
  /** Button label (already translated). */
  label: string;
  icon?: ReactNode;
  /** Shown as a side sheet. */
  render: (ctx: WorkspaceContext & { close: () => void }) => ReactNode;
  /** Only show for some viewers. */
  visible?: (ctx: WorkspaceContext) => boolean;
}

export interface StudioExtension {
  id: string;
  /** Small inline content at the end of every line row (e.g. comment count, consensus badge). */
  lineRowExtras?: (line: LineDTO, ctx: WorkspaceContext) => ReactNode;
  /** Content under the line editor (e.g. suggestions, Quran-quote panel for this line). */
  lineEditorExtras?: (ctx: LineEditorContext) => ReactNode;
  /** Extra items in the page tools bar. */
  toolbarExtras?: (ctx: WorkspaceContext) => ReactNode;
  /** Side panels opened from the tools bar. */
  panels?: WorkspacePanel[];
  /** Handler for page events. Return true when the event is fully handled (the page is then not re-fetched). */
  onEvent?: (ev: { type: string; payload: Record<string, unknown>; actor_id: string | null }, ctx: WorkspaceContext) => void | boolean;
  /** Extra rows for the keyboard-shortcuts overlay: i18n keys for the group title and each label. */
  shortcuts?: { group: string; rows: [string[], string][] }[];
  /** SVG drawn above the line overlay, in image pixel coordinates (e.g. presence avatars, annotation pins). */
  imageOverlay?: (ctx: WorkspaceContext) => ReactNode;
}
