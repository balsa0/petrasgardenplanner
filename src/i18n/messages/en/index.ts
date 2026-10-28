// English source strings, one file per area of the app. Keys are "namespace.area.name".
import common from "./common";
import panels from "./panels";
import shell from "./shell";
import tools from "./tools";
import walk from "./walk";

const en = { ...common, ...shell, ...panels, ...tools, ...walk };

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;
export default en as Messages;
