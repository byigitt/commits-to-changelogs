import { Command, Option } from "commander";
import pc from "picocolors";
import { runSetup } from "./commands/setup.js";
import {
  runGenerate,
  validateProviderFlag,
  validateStyleFlag,
  type GenerateFlags,
} from "./commands/generate.js";
import {
  runConfigEdit,
  runConfigGet,
  runConfigPath,
  runConfigSet,
  runProviders,
} from "./commands/config.js";
import { PROVIDER_IDS, STYLE_IDS } from "./core/config.js";

const VERSION = "0.0.1";

function banner(): string {
  const title = pc.bold(pc.magenta("ctc"));
  const sub = pc.dim("commits → changelogs");
  return `${title} ${pc.dim("·")} ${sub}`;
}

const program = new Command();

program
  .name("ctc")
  .description(
    `${banner()}\n\nTurn your git commits into a polished CHANGELOG.md with AI.\nMulti-provider, free-tier friendly.`,
  )
  .version(VERSION, "-v, --version", "show version")
  .showHelpAfterError("(run `ctc --help` for usage)");

const generateCmd = program
  .command("generate", { isDefault: true })
  .alias("gen")
  .description("generate a changelog from your commits (default)")
  .option("--from <ref>", "start commit/tag (exclusive)")
  .option("--to <ref>", "end commit (default: HEAD)")
  .option("-o, --output <path>", "output file (default: CHANGELOG.md)")
  .addOption(
    new Option("-s, --style <style>", "changelog style").choices(STYLE_IDS as unknown as string[]),
  )
  .option("--version-label <label>", 'version label (e.g. "1.2.0" or "Unreleased")')
  .option("--unreleased", 'force "Unreleased" version header', false)
  .option("--dry-run", "print the result without writing the file", false)
  .option("-y, --yes", "skip confirmation prompts", false)
  .option("--no-stream", "disable streaming output")
  .addOption(
    new Option("-p, --provider <name>", "AI provider override").choices(
      PROVIDER_IDS as unknown as string[],
    ),
  )
  .option("-m, --model <id>", "model id override")
  .action(
    async (
      opts: {
        from?: string;
        to?: string;
        output?: string;
        style?: string;
        versionLabel?: string;
        unreleased?: boolean;
        dryRun?: boolean;
        yes?: boolean;
        stream?: boolean;
        provider?: string;
        model?: string;
      },
    ) => {
      const flags: GenerateFlags = {
        unreleased: opts.unreleased,
        dryRun: opts.dryRun,
        yes: opts.yes,
        stream: opts.stream,
      };
      if (opts.from !== undefined) flags.from = opts.from;
      if (opts.to !== undefined) flags.to = opts.to;
      if (opts.output !== undefined) flags.output = opts.output;
      if (opts.style !== undefined) flags.style = validateStyleFlag(opts.style);
      if (opts.versionLabel !== undefined) flags.version = opts.versionLabel;
      if (opts.provider !== undefined) flags.provider = validateProviderFlag(opts.provider);
      if (opts.model !== undefined) flags.model = opts.model;
      await runGenerate(flags);
    },
  );

generateCmd.addHelpText(
  "after",
  `\nExamples:\n  $ ctc                              generate using defaults\n  $ ctc --from v1.0.0                changelog since tag v1.0.0\n  $ ctc -p groq -m llama-3.3-70b-versatile\n  $ ctc --dry-run                    preview without writing\n  $ ctc --version-label 1.2.0 -y\n`,
);

program
  .command("setup")
  .description("interactive setup: pick a provider, paste your key, choose defaults")
  .action(async () => {
    await runSetup();
  });

const configCmd = program.command("config").description("view or edit ctc configuration");

configCmd
  .command("get [key]")
  .description("print full config or a single dotted key (api keys are masked)")
  .action((key?: string) => {
    runConfigGet(key);
  });

configCmd
  .command("set <key> <value>")
  .description("set a dotted key (e.g. defaultProvider groq)")
  .option("--project", "write to project config instead of user config", false)
  .action((key: string, value: string, opts: { project?: boolean }) => {
    runConfigSet(key, value, opts.project ? "project" : "user");
  });

configCmd
  .command("path")
  .description("print the path to the config file")
  .option("--project", "print the project config path", false)
  .action((opts: { project?: boolean }) => {
    runConfigPath(opts.project ? "project" : "user");
  });

configCmd
  .command("edit")
  .description("open the config file in $EDITOR")
  .option("--project", "edit the project config", false)
  .action((opts: { project?: boolean }) => {
    runConfigEdit(opts.project ? "project" : "user");
  });

program
  .command("providers")
  .alias("ls")
  .description("list supported providers and their status")
  .action(() => {
    runProviders();
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(pc.red("error:"), err instanceof Error ? err.message : String(err));
  process.exit(1);
});
