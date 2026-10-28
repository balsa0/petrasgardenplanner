// English source strings, one file per area of the app. Keys are "namespace.area.name".
import catalogue from "./catalogue";
import common from "./common";
import furnish from "./furnish";
import irrigation from "./irrigation";
import panels from "./panels";
import shell from "./shell";
import tools from "./tools";
import walk from "./walk";

const en = { ...common, ...shell, ...panels, ...tools, ...walk, ...catalogue, ...furnish, ...irrigation };

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;
export default en as Messages;
