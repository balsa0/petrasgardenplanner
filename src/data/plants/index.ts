// The plant database: every JSON file in this folder, merged. Validate with `npm run plants:check`.
import core from "./core.json";
import trees from "./trees.json";
import shrubs from "./shrubs.json";
import mediterranean from "./mediterranean.json";
import perennials from "./perennials.json";
import centralNatives from "./central-natives.json";
import kitchen from "./kitchen.json";

export const PLANT_DATA: unknown[] = [...core, ...trees, ...shrubs, ...mediterranean, ...perennials, ...centralNatives, ...kitchen];
