import { Command } from "commander";
import pc from "picocolors";

const VERSION = "0.0.1";

function banner(): string {
  const title = pc.bold(pc.magenta("ctc"));
  const sub = pc.dim("commits → changelogs");
  return `${title} ${pc.dim("·")} ${sub}`;
}

const program = new Command();

program
  .name("ctc")
  .description(`${banner()}\n\nTurn your git commits into a polished CHANGELOG.md with AI.`)
  .version(VERSION, "-v, --version", "show version");

program
  .command("setup")
  .description("interactive setup: pick a provider, paste your key, choose defaults")
  .action(() => {
    console.log(pc.yellow("setup wizard coming soon"));
  });

program
  .command("generate", { isDefault: true })
  .description("generate a changelog from your commits")
  .action(() => {
    console.log(pc.yellow("generate command coming soon"));
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(pc.red("error:"), err instanceof Error ? err.message : String(err));
  process.exit(1);
});
