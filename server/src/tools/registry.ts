/** Every tool the model may call, looked up by the name it sends back. */
import {
  describeGetWeatherCall,
  getWeather,
  getWeatherDeclaration,
  type GetWeatherArgs,
} from "./getWeather.js";
import {
  describeSearchMyChatsCall,
  searchMyChats,
  searchMyChatsDeclaration,
  type SearchMyChatsArgs,
} from "./searchMyChats.js";

export type ToolArgs = Record<string, unknown>;

/** Everything a tool needs beyond its own arguments. `userId` is what keeps a
 *  tool reading one person's data rather than everyone's. */
export type ToolContext = {
  userId: string;
  signal: AbortSignal;
};

/** Provider-neutral: mapping these to a provider's own tool format is that
 *  provider's job, which for Gemini is lib/history. */
export type ToolDeclaration = {
  name: string;
  description: string;
  parameters: unknown;
};

export type Tool = {
  declaration: ToolDeclaration;
  describe: (args: ToolArgs) => string;
  run: (args: ToolArgs, context: ToolContext) => Promise<unknown>;
};

/** The model sends untyped JSON, so a missing or wrong-typed value becomes
 *  blank here, which every tool already rejects. */
const asText = (value: unknown): string => (typeof value === "string" ? value : "");

const asWeatherArgs = (args: ToolArgs): GetWeatherArgs => ({ place: asText(args.place) });

const asSearchArgs = (args: ToolArgs): SearchMyChatsArgs => ({ query: asText(args.query) });

const TOOLS: Record<string, Tool> = {
  [getWeatherDeclaration.name]: {
    declaration: getWeatherDeclaration,
    describe: (args) => describeGetWeatherCall(asWeatherArgs(args)),
    run: (args, { signal }) => getWeather(asWeatherArgs(args), signal),
  },
  [searchMyChatsDeclaration.name]: {
    declaration: searchMyChatsDeclaration,
    describe: (args) => describeSearchMyChatsCall(asSearchArgs(args)),
    run: (args, { userId }) => searchMyChats(asSearchArgs(args), userId),
  },
};

export const findTool = (name: string | undefined): Tool | undefined => {
  if (!name) return undefined;
  return TOOLS[name];
};

export const toolDeclarations: ToolDeclaration[] = Object.values(TOOLS).map((tool) => tool.declaration);
