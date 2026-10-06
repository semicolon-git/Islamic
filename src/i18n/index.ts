import type { Messages } from "./core";
import { common } from "./messages/common";
import { beneficiary } from "./messages/beneficiary";
import { ask } from "./messages/ask";
import { cards } from "./messages/cards";
import { inbox } from "./messages/inbox";
import { manuscripts } from "./messages/manuscripts";
import { heritage } from "./messages/heritage";
import { evalMessages } from "./messages/eval-alias";
import { pwa } from "./messages/pwa";
import { portal } from "./messages/portal";
import { msCollab } from "./messages/ms-collab";
import { library } from "./messages/library";
import { discover } from "./messages/discover";
import { science } from "./messages/science";

export * from "./core";

const parts: Messages[] = [common, beneficiary, ask, cards, inbox, manuscripts, heritage, evalMessages, pwa, portal, msCollab, library, discover, science];
export const messages: Messages = {
  en: Object.assign({}, ...parts.map((p) => p.en)),
  ar: Object.assign({}, ...parts.map((p) => p.ar)),
};
