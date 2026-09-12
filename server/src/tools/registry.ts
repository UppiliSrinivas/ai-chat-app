/** Every tool the model may call, looked up by the name it sends back. */
import {
  describeGetWeatherCall,
  getWeather,
  getWeatherDeclaration,
  type GetWeatherArgs,
} from "./getWeather.js";

export type ToolArgs = Record<string, unknown>;

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
  run: (args: ToolArgs, signal?: AbortSignal) => Promise<unknown>;
};

/** The model sends untyped JSON, so each tool narrows its own arguments. A
 *  missing `place` becomes blank, which getWeather already rejects. */
const asWeatherArgs = (args: ToolArgs): GetWeatherArgs => ({
  place: typeof args.place === "string" ? args.place : "",
});

const TOOLS: Record<string, Tool> = {
  [getWeatherDeclaration.name]: {
    declaration: getWeatherDeclaration,
    describe: (args) => describeGetWeatherCall(asWeatherArgs(args)),
    run: (args, signal) => getWeather(asWeatherArgs(args), signal),
  },
};

export const findTool = (name: string | undefined): Tool | undefined => {
  if (!name) return undefined;
  return TOOLS[name];
};

export const toolDeclarations: ToolDeclaration[] = Object.values(TOOLS).map((tool) => tool.declaration);
