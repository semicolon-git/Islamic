import { describe, expect, it } from "vitest";
import type { Role } from "@/lib/auth";
import type { Status } from "@/lib/workflow";
import {
  canAdjudicate, canAssign, canComment, canConfirmAnnotation, canDecideHardWord, canKey, canResolveComment, canReviewPage, canReviewSuggestion,
  canSuggest, extractMentions, initials, lineAccess, pointsFor, uniqueAwards,
} from "./rules";

const ROLES: Role[] = ["student", "researcher", "institution_admin", "specialist", "platform_admin"];

describe("permission matrix", () => {
  const matrix = (fn: (r: Role) => boolean) => Object.fromEntries(ROLES.map((r) => [r, fn(r)]));

  it("students key and comment, but never adjudicate, confirm annotations or review pages", () => {
    expect(matrix(canKey)).toEqual({ student: true, researcher: false, institution_admin: false, specialist: false, platform_admin: true });
    expect(matrix(canAdjudicate)).toEqual({ student: false, researcher: true, institution_admin: false, specialist: false, platform_admin: true });
    expect(matrix(canConfirmAnnotation)).toEqual({ student: false, researcher: true, institution_admin: false, specialist: false, platform_admin: true });
    expect(matrix(canReviewPage)).toEqual({ student: false, researcher: true, institution_admin: false, specialist: false, platform_admin: true });
    expect(matrix(canAssign)).toEqual({ student: false, researcher: true, institution_admin: true, specialist: false, platform_admin: true });
    expect(matrix(canComment)).toEqual({ student: true, researcher: true, institution_admin: true, specialist: false, platform_admin: true });
  });

  it("institution admins never suggest text; nobody suggests on a published page", () => {
    expect(canSuggest("institution_admin", "ai_draft")).toBe(false);
    expect(canSuggest("student", "student_submitted")).toBe(true);
    expect(canSuggest("researcher", "published")).toBe(false);
  });

  it("line access: edit when allowed, else suggest (locked / owned by someone else / frozen), else read", () => {
    const base = { userId: "u_sara", lockedBy: null, ownerId: null } as const;
    const s = (role: Role, status: Status, extra: Partial<{ lockedBy: string | null; ownerId: string | null }> = {}) => lineAccess({ ...base, role, status, ...extra });
    expect(s("student", "ai_draft")).toBe("edit");
    expect(s("student", "ai_draft", { lockedBy: "u_omar" })).toBe("suggest");
    expect(s("student", "ai_draft", { lockedBy: "u_sara" })).toBe("edit");
    expect(s("student", "ai_draft", { ownerId: "u_omar" })).toBe("suggest");
    expect(s("student", "ai_draft", { ownerId: "u_sara" })).toBe("edit");
    expect(s("researcher", "ai_draft", { ownerId: "u_omar" })).toBe("edit"); // ownership guides students, not reviewers
    expect(s("student", "student_submitted")).toBe("suggest");
    expect(s("researcher", "student_submitted")).toBe("edit");
    expect(s("institution_admin", "ai_draft")).toBe("read");
    expect(s("student", "published")).toBe("read");
  });

  it("suggestions are decided by a researcher or the page's owner, never by their author", () => {
    const c = (role: Role, userId: string, ownerId: string | null, status: Status = "ai_draft") =>
      canReviewSuggestion({ role, userId, authorId: "u_omar", ownerId, status }).ok;
    expect(c("researcher", "u_huda", null)).toBe(true);
    expect(c("student", "u_sara", "u_sara")).toBe(true);
    expect(c("student", "u_sara", null)).toBe(false);
    expect(c("student", "u_omar", "u_omar")).toBe(false); // own suggestion
    expect(c("institution_admin", "u_khalid", null)).toBe(false);
    expect(c("researcher", "u_huda", null, "published")).toBe(false);
    expect(c("student", "u_sara", "u_sara", "student_submitted")).toBe(false); // the owner can't edit any more
  });

  it("four eyes on hard words: a researcher who keyed the word can't decide it", () => {
    expect(canDecideHardWord({ role: "researcher", userId: "u_huda", keyers: ["u_sara", "u_omar"], status: "ai_draft" }).ok).toBe(true);
    expect(canDecideHardWord({ role: "researcher", userId: "u_huda", keyers: ["u_huda"], status: "ai_draft" }).ok).toBe(false);
    expect(canDecideHardWord({ role: "student", userId: "u_sara", keyers: [], status: "ai_draft" }).ok).toBe(false);
    expect(canDecideHardWord({ role: "researcher", userId: "u_huda", keyers: [], status: "published" }).ok).toBe(false);
  });

  it("comment threads are resolved by their author or a researcher/admin", () => {
    expect(canResolveComment("student", "u_sara", "u_sara")).toBe(true);
    expect(canResolveComment("student", "u_sara", "u_omar")).toBe(false);
    expect(canResolveComment("researcher", "u_huda", "u_omar")).toBe(true);
  });
});

describe("points", () => {
  it("margins and paratexts earn more than the main text", () => {
    expect(pointsFor("ms_line_accepted", "main")).toBe(2);
    expect(pointsFor("ms_line_accepted", "margin")).toBe(4);
    expect(pointsFor("ms_keying_accepted", null)).toBe(1);
    expect(pointsFor("ms_suggestion_accepted", "colophon")).toBe(3);
  });
  it("a batch never awards the same (user, reason, ref) twice", () => {
    const a = { user_id: "u", reason: "ms_line_accepted" as const, ref: "line:x", delta: 2 };
    expect(uniqueAwards([a, a, { ...a, user_id: "v" }, { ...a, delta: 0, ref: "line:y" }])).toHaveLength(2);
  });
});

describe("mentions and public credits", () => {
  const people = [
    { id: "u_sara", name_en: "Sara Al-Harbi", name_ar: "سارة الحربي" },
    { id: "u_huda", name_en: "Dr. Huda Al-Qahtani", name_ar: "د. هدى القحطاني" },
  ];
  it("finds @mentions by English or Arabic name, only among participants", () => {
    expect(extractMentions("@Sara Al-Harbi please check the dots", people)).toEqual(["u_sara"]);
    expect(extractMentions("راجعي يا @د. هدى القحطاني", people)).toEqual(["u_huda"]);
    expect(extractMentions("@Sara Al-Harbiyya", people)).toEqual([]);
    expect(extractMentions("@Someone Else", people)).toEqual([]);
  });
  it("shows students by initials", () => {
    expect(initials("Sara Al-Harbi")).toBe("S. H.");
    expect(initials("سارة الحربي")).toBe("س. ح.");
    expect(initials("Omar Haddad")).toBe("O. H.");
  });
});
